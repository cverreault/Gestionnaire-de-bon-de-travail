import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { I18nModule, AcceptLanguageResolver, QueryResolver, HeaderResolver } from 'nestjs-i18n';
import { LoggerModule } from 'nestjs-pino';
import { loggerConfig } from './common/logger/logger.config';
import * as path from 'path';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UserScopedThrottlerGuard } from './common/guards/user-scoped-throttler.guard';
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
import { AuditModule } from './modules/audit/audit.module';
import { SearchModule } from './modules/search/search.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SystemConfigsModule } from './modules/system-configs/system-configs.module';
import { ReportsModule } from './modules/reports/reports.module';

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

    // ── Cron / scheduled jobs ─────────────────────────────────────────────
    // Active @Cron decorators dans les services (cleanup nocturne refresh
    // tokens, futurs jobs SLA, etc.). Voir doc/sprints/2026-06-... §C9.
    ScheduleModule.forRoot(),

    // ── Rate limiting ──────────────────────────────────────────────────────
    // Integration tests set THROTTLER_DISABLE=1 — every bucket gets a
    // very high limit so the cumulative requests of a multi-test run
    // don't trip the cap. Production keeps the tight defaults.
    ThrottlerModule.forRoot(
      process.env.THROTTLER_DISABLE === '1'
        ? [
            { name: 'short', ttl: 1000, limit: 1_000_000 },
            { name: 'medium', ttl: 10000, limit: 1_000_000 },
            { name: 'long', ttl: 60000, limit: 1_000_000 },
          ]
        : [
            { name: 'short', ttl: 1000, limit: 20 },
            { name: 'medium', ttl: 10000, limit: 100 },
            { name: 'long', ttl: 60000, limit: 300 },
          ],
    ),

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
    AuditModule,
    SearchModule,
    NotificationsModule,
    SystemConfigsModule,
    ReportsModule,
  ],
  providers: [
    // ── Guards globaux ─────────────────────────────────────────────────────
    // Ordre important : JwtAuthGuard d'abord (authentification),
    // puis RolesGuard (autorisation), puis Throttler (rate limiting).
    // Le guard JWT bypass les routes @Public(). Le throttler scope par userId
    // si l'auth a réussi, sinon par IP (cas login/refresh anonymes).
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserScopedThrottlerGuard,
    },
  ],
})
export class AppModule {}
