// Sentry MUST be the first import so its auto-instrumentation can patch
// Node modules (http, pg, etc.) before they're require()d elsewhere.
import * as Sentry from '@sentry/node';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { I18nValidationPipe, I18nValidationExceptionFilter } from 'nestjs-i18n';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import compression from 'compression';
import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';
import { Logger as PinoLogger } from 'nestjs-pino';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import { assertSecrets } from './common/config/assert-secrets';
import { PublicApiModule } from './modules/public-api/public-api.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { RecurringModule } from './modules/recurring/recurring.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DatabaseHealthIndicator } from './modules/health/indicators/database.health';
import { MinioHealthIndicator } from './modules/health/indicators/minio.health';

/**
 * Sentry init (C10).
 *
 * Disabled by default: we ship a fully working backend without a Sentry
 * account. Set SENTRY_DSN in the env to opt in. SENTRY_ENVIRONMENT and
 * SENTRY_RELEASE annotate the events for filtering in the Sentry UI.
 *
 * tracesSampleRate=0.1 — 10% of HTTP requests get a perf trace. Plenty
 * to spot slow paths without blowing up the quota on a small instance.
 * Override with SENTRY_TRACES_SAMPLE_RATE if needed.
 */
function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // Deliberately noisy so the operator knows Sentry is inactive without
    // having to grep the config.
    // eslint-disable-next-line no-console
    console.log('ℹ️  Sentry disabled — set SENTRY_DSN in env to enable error tracking.');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Don't capture health endpoint pings — they'd dominate the event feed.
    beforeSend(event) {
      const url = event.request?.url ?? '';
      if (url.endsWith('/api/health') || url.endsWith('/api/health/detailed')) {
        return null;
      }
      return event;
    },
  });
  // eslint-disable-next-line no-console
  console.log(
    `✅ Sentry initialised (env=${process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development'})`,
  );
}
initSentry();

/**
 * Boot-time smoke test (C11).
 *
 * Run the same dependency probes the readiness endpoint runs, but BEFORE
 * `app.listen()` opens the socket. If the DB or MinIO are unreachable a
 * fresh container would happily accept traffic and return 5xx on every
 * request — this catches that case at deploy time, not in the user's
 * monitoring dashboard.
 *
 * Set BOOT_SMOKE_DISABLE=1 to skip (useful for very minimal dev setups
 * where MinIO isn't running).
 */
async function runBootSmokeTest(
  app: INestApplication,
  logger: { log: (msg: string) => void; error: (msg: string) => void },
): Promise<void> {
  if (process.env.BOOT_SMOKE_DISABLE === '1') {
    logger.log('Boot smoke test SKIPPED via BOOT_SMOKE_DISABLE=1');
    return;
  }

  // strict:false → look up providers across the whole module tree, not just
  // the root module (the indicators live inside HealthModule).
  const db = app.get(DatabaseHealthIndicator, { strict: false });
  const minio = app.get(MinioHealthIndicator, { strict: false });

  const results = await Promise.allSettled([
    db.check('database'),
    minio.check('minio'),
  ]);

  const failures: string[] = [];
  results.forEach((r, i) => {
    const name = ['database', 'minio'][i];
    if (r.status === 'rejected') {
      // Terminus' HealthCheckError stores the underlying cause inside the
      // `causes` property keyed by the check name — surface it so the boot
      // log actually tells the operator WHY the probe failed.
      const err = r.reason as { message?: string; causes?: Record<string, { error?: string }> };
      const inner = err.causes?.[name]?.error;
      const message = inner ?? err.message ?? String(r.reason);
      failures.push(`${name}: ${message}`);
    }
  });

  if (failures.length > 0) {
    logger.error(`💥 Boot smoke test FAILED — ${failures.join(' | ')}`);
    throw new Error(`Dependencies unreachable at boot: ${failures.join(', ')}`);
  }

  logger.log('✅ Boot smoke test passed (DB + MinIO)');
}

// Postgres BIGINT columns (e.g. `current_storage_bytes` on tenants) come
// back as native BigInt from Prisma. `JSON.stringify` does not know how
// to serialise BigInt and throws "Do not know how to serialize a BigInt",
// which surfaces as a silent 500 on the client. We coerce to Number once,
// globally — values stay well under Number.MAX_SAFE_INTEGER for our use
// case (storage bytes max out around 100 GB = ~10^11).
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  // B25 — refuse to boot with missing/weak JWT secrets (token forgery).
  assertSecrets();

  // Booter avec bufferLogs pour que les premiers logs (avant que Pino
  // soit prêt) soient stockés et flushés via Pino une fois disponible.
  // rawBody: the Stripe webhook (B22) must verify its signature against
  // the UNPARSED request body — Nest keeps it on req.rawBody.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // Remplacer le Logger NestJS par notre instance Pino. Tous les `Logger`
  // existants dans le code (via `new Logger(name)`) héritent du provider
  // racine, donc continuent de fonctionner — mais transitent maintenant
  // par Pino.
  app.useLogger(app.get(PinoLogger));
  const logger = app.get(PinoLogger);

  // ── Security ──────────────────────────────────────────────────────────────
  // B25: the app sits behind nginx — trust the first proxy hop so req.ip is
  // the real client (X-Forwarded-For) and the per-IP throttler buckets per
  // client instead of collapsing every request onto the nginx IP.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(compression());

  // ── CORS ──────────────────────────────────────────────────────────────────
  // The frontend UI is served from `CORS_ORIGIN` — accepts a single origin
  // OR a comma-separated list. Entries support ONE leading wildcard label
  // (`https://*.dispatch2go.com`) so multi-tenant subdomains don't have to
  // be enumerated per tenant. Third-party public-API integrations use
  // `PUBLIC_API_CORS_ORIGINS` (comma-separated, exact matches only).
  const uiOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:8088')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const publicOrigins = (process.env.PUBLIC_API_CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const exactOrigins = new Set<string>();
  const wildcardSuffixes: string[] = [];
  for (const entry of [...uiOrigins, ...publicOrigins]) {
    const m = entry.match(/^(https?:\/\/)\*\.(.+)$/);
    if (m) {
      // `https://*.example.com` matches any single-or-multi-label subdomain
      // of example.com over that scheme, but NOT the apex itself (list it
      // separately if needed).
      wildcardSuffixes.push(`${m[1]}` + '|' + m[2]);
    } else {
      exactOrigins.add(entry);
    }
  }
  const originAllowed = (origin: string): boolean => {
    if (exactOrigins.has(origin)) return true;
    for (const entry of wildcardSuffixes) {
      const [scheme, domain] = entry.split('|');
      if (
        origin.startsWith(scheme) &&
        origin.endsWith(`.${domain}`) &&
        // No path/port smuggling: everything between scheme and the domain
        // suffix must be subdomain labels only.
        /^[a-z0-9.-]+$/i.test(origin.slice(scheme.length, origin.length - domain.length - 1))
      ) {
        return true;
      }
    }
    return false;
  };
  app.enableCors({
    origin: (origin, callback) => {
      // Allow same-origin (no `Origin` header) + whitelisted origins.
      if (!origin || originAllowed(origin)) return callback(null, true);
      // Disallowed origin: answer WITHOUT CORS headers (browser blocks the
      // response) instead of erroring — an Error here surfaces as a 500 on
      // every request from the stray origin, which reads as a server bug.
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  });

  // ── Global prefix ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ── Global interceptors & filters ─────────────────────────────────────────
  app.useGlobalInterceptors(new TransformInterceptor());
  // Order matters: i18n filter first (handles I18nValidationException), then
  // the generic HTTP filter for everything else.
  // Filter order — NestJS runs `useGlobalFilters` in REVERSE order for
  // matching, so the LAST filter registered wins for compatible exception
  // types. `I18nValidationExceptionFilter` must run *after* our generic
  // `HttpExceptionFilter` otherwise the generic one swallows validation
  // errors and the client only sees "Bad Request".
  //
  // `detailedErrors: true` → the 400 response carries a `message` array
  // enumerating every field that failed validation (with the translated
  // message from `i18nValidationMessage`).
  app.useGlobalFilters(
    new HttpExceptionFilter(),
    new I18nValidationExceptionFilter({ detailedErrors: true }),
  );

  // ── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new I18nValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── Docs gate ─────────────────────────────────────────────────────────────
  // `/api/v1/docs*` is our public-API reference (Swagger UI + JSON spec).
  // `SwaggerModule.setup()` mounts express handlers directly on the HTTP
  // adapter, so NestJS's global JwtAuthGuard never sees these requests.
  // We add an express middleware that requires a valid access-token JWT
  // before those handlers run — subscribers of the platform reach the
  // docs from the authenticated frontend page (which forwards the JWT
  // via axios). Anonymous curls / browser navigations get 401.
  {
    const jwt = app.get(JwtService);
    const docsGate = (req: Request, res: Response, next: NextFunction) => {
      // Match `/api/v1/docs`, `/api/v1/docs/*`, and `/api/v1/docs-json`.
      // Query strings are stripped by Express before matching req.path.
      const path = req.path;
      const isDocsPath =
        path === '/api/v1/docs' ||
        path.startsWith('/api/v1/docs/') ||
        path === '/api/v1/docs-json';
      if (!isDocsPath) {
        return next();
      }
      const auth = req.headers.authorization ?? '';
      const [scheme, token] = auth.split(' ');
      if (scheme !== 'Bearer' || !token) {
        res.status(401).json({
          statusCode: 401,
          message: 'Authentication required to access the API docs.',
          error: 'Unauthorized',
        });
        return;
      }
      try {
        jwt.verify(token);
        next();
      } catch {
        res.status(401).json({
          statusCode: 401,
          message: 'Invalid or expired token.',
          error: 'Unauthorized',
        });
      }
    };
    app.use(docsGate);
  }

  // ── Swagger — internal docs (désactivé en production) ────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Dispatch2Go API')
      .setDescription('API pour la gestion des bons de travail (BT) et répartition des techniciens')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  // ── Swagger — public v1 API docs (available in production too, B8) ──────
  // Documents only controllers whose route starts with `v1/`. External
  // integrators need this reachable to build their integrations; the doc
  // itself never exposes data, only the schema.
  {
    const publicConfig = new DocumentBuilder()
      .setTitle('Dispatch2Go Public API v1')
      .setDescription(
        'API publique pour piloter Dispatch2Go depuis un système externe. ' +
        'Authentification par en-tête `X-API-Key` — créer une clé depuis ' +
        '/parametres/api-keys dans le portail admin du tenant. ' +
        'Chaque endpoint documente le scope requis (read-only, read-write, admin).',
      )
      .setVersion('1.0')
      .addApiKey(
        { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        'api-key',
      )
      .build();

    // `include: [PublicApiModule]` tells NestJS's Swagger scanner to only
    // pick up controllers from the public-api module — the doc will not
    // even mention internal endpoints, no filtering needed.
    const document = SwaggerModule.createDocument(app, publicConfig, {
      include: [PublicApiModule, WebhooksModule, AlertsModule, RecurringModule],
      operationIdFactory: (controllerKey, methodKey) =>
        `${controllerKey}_${methodKey}`,
    });

    SwaggerModule.setup('api/v1/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // ── Init modules so onModuleInit/onApplicationBootstrap hooks run BEFORE
  //    the smoke test (the MinIO indicator instantiates its client there).
  //    app.listen() also calls init() internally; doing it explicitly here
  //    is idempotent and lets us probe deps before opening the socket.
  await app.init();

  // ── Boot-time smoke test (C11) ────────────────────────────────────────────
  // Probe DB + MinIO before opening the socket. Aborts bootstrap on failure.
  await runBootSmokeTest(app, {
    log: (m) => logger.log(m),
    error: (m) => logger.error(m),
  });

  // ── Start ─────────────────────────────────────────────────────────────────
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  logger.log(`🚀 Application running on port ${port}`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
