import { NestFactory } from '@nestjs/core';
import { I18nValidationPipe, I18nValidationExceptionFilter } from 'nestjs-i18n';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DatabaseHealthIndicator } from './modules/health/indicators/database.health';
import { MinioHealthIndicator } from './modules/health/indicators/minio.health';

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

async function bootstrap() {
  // Booter avec bufferLogs pour que les premiers logs (avant que Pino
  // soit prêt) soient stockés et flushés via Pino une fois disponible.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Remplacer le Logger NestJS par notre instance Pino. Tous les `Logger`
  // existants dans le code (via `new Logger(name)`) héritent du provider
  // racine, donc continuent de fonctionner — mais transitent maintenant
  // par Pino.
  app.useLogger(app.get(PinoLogger));
  const logger = app.get(PinoLogger);

  // ── Security ──────────────────────────────────────────────────────────────
  app.use(helmet());
  app.use(compression());

  // ── CORS ──────────────────────────────────────────────────────────────────
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:8088';
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ── Global prefix ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ── Global interceptors & filters ─────────────────────────────────────────
  app.useGlobalInterceptors(new TransformInterceptor());
  // Order matters: i18n filter first (handles I18nValidationException), then
  // the generic HTTP filter for everything else.
  app.useGlobalFilters(
    new I18nValidationExceptionFilter({ detailedErrors: false }),
    new HttpExceptionFilter(),
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

  // ── Swagger (désactivé en production) ────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('TaskMgr API')
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
