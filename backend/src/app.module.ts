import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { I18nModule, AcceptLanguageResolver, QueryResolver, HeaderResolver } from 'nestjs-i18n';
import { LoggerModule } from 'nestjs-pino';
import { loggerConfig } from './common/logger/logger.config';
import * as path from 'path';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { EventLoggerListener } from './common/listeners/event-logger.listener';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';
import { ClientsModule } from './modules/clients/clients.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SettingsModule } from './modules/settings/settings.module';
import { BackupModule } from './modules/backup/backup.module';
import { ProcessModule } from './modules/process/process.module';
import { TemplatesModule } from './modules/templates/templates.module';

@Module({
  imports: [
    // ── Configuration ──────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // ── Logger structuré Pino (ADR-007 / C1) ──────────────────────────────
    // JSON brut en prod (parsable Loki/Datadog), pretty-print en dev.
    // Request ID propagé via x-request-id. Redaction auto des secrets.
    LoggerModule.forRoot(loggerConfig),

    // ── Domain events bus ─────────────────────────────────────────────────
    // Voir ADR-001 §3a et ADR-003 §6.
    // Wildcard activé pour permettre @OnEvent('workOrders.*') côté listeners.
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),

    // ── Rate limiting ──────────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 20,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 100,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 300,
      },
    ]),

    // ── i18n (FR default, EN via Accept-Language or ?lang=) ──────────────
    I18nModule.forRoot({
      fallbackLanguage: 'fr',
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: false,
      },
      resolvers: [
        new QueryResolver(['lang']),
        new HeaderResolver(['x-lang']),
        AcceptLanguageResolver,
      ],
    }),

    // ── Core ───────────────────────────────────────────────────────────────
    PrismaModule,

    // ── Feature modules ────────────────────────────────────────────────────
    HealthModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    WorkOrdersModule,
    AttachmentsModule,
    CalendarModule,
    DashboardModule,
    SettingsModule,
    BackupModule,
    ProcessModule,
    TemplatesModule,
  ],
  providers: [
    // ── Guards globaux ─────────────────────────────────────────────────────
    // Ordre important : JwtAuthGuard d'abord (authentification),
    // puis RolesGuard (autorisation). Le guard JWT bypass les routes @Public().
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },

    // ── Domain event listeners (cross-cutting) ─────────────────────────────
    // Démo / smoke test : logue chaque event publié. Sera remplacé par le
    // module `audit` (B2) qui persistera les events en DB.
    EventLoggerListener,
  ],
})
export class AppModule {}
