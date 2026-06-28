import { NestFactory } from '@nestjs/core';
import { I18nValidationPipe, I18nValidationExceptionFilter } from 'nestjs-i18n';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

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

  // ── Start ─────────────────────────────────────────────────────────────────
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  logger.log(`🚀 Application running on port ${port}`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
