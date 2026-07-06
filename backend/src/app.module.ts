import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
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
import { StorageModule } from './common/storage/storage.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UserScopedThrottlerGuard } from './common/guards/user-scoped-throttler.guard';
import { ApiKeyAuthGuard } from './common/guards/api-key-auth.guard';
import { ApiScopeGuard } from './common/guards/api-scope.guard';
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
import { LocationsModule } from './modules/locations/locations.module';
import { TenantResolverMiddleware } from './common/middleware/tenant-resolver.middleware';
import { RequestContextModule } from './common/context/request-context.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { PublicApiModule } from './modules/public-api/public-api.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { RecurringModule } from './modules/recurring/recurring.module';
import { DispatchMapModule } from './modules/dispatch-map/dispatch-map.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { PortalModule } from './modules/portal/portal.module';
import { BillingModule } from './modules/billing/billing.module';

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
    // Three named buckets fired in parallel — a request must fit under all
    // three or gets throttled. Naming lets @Throttle() decorators target
    // one bucket at a time for per-route overrides (public API v1 uses
    // higher limits configured via env — see PublicApiThrottleGuard).
    //
    // Integration tests set THROTTLER_DISABLE=1 → all buckets get an
    // effectively infinite limit so multi-test runs don't trip the cap.
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
    StorageModule,
    RequestContextModule,
    TenantsModule,
    ApiKeysModule,
    WebhooksModule,
    AlertsModule,
    RecurringModule,
    DispatchMapModule,
    RemindersModule,
    PortalModule,
    BillingModule,
    PublicApiModule,

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
    LocationsModule,
  ],
  providers: [
    // ── Guards globaux ─────────────────────────────────────────────────────
    // Ordre important — chaque guard runs BEFORE the next :
    //   1. JwtAuthGuard         — internal UI (bypassed on @Public + /api/v1/*)
    //   2. ApiKeyAuthGuard      — public API v1 (short-circuits on non-v1)
    //   3. ApiScopeGuard        — scope check on v1 (short-circuits on non-v1)
    //   4. RolesGuard           — @Roles on internal UI (no-op on v1)
    //   5. UserScopedThrottler  — rate limit (apiKey → user → ip)
    //
    // Registering ApiKey + ApiScope globally is defence-in-depth : even if
    // a new /api/v1/* controller forgets @UseGuards, the global pipeline
    // still enforces auth + scope. See ADR-011 § "Guards & pipeline".
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiScopeGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserScopedThrottlerGuard,
    },
    // Tenant resolver — needs to be a provider so NestJS can DI Prisma
    // into the middleware. The actual wiring (`forRoutes`) happens in
    // `configure()` below.
    TenantResolverMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Runs first — every /api request gets a resolved tenant attached
    // to `request.tenant` before any guard or controller. The health
    // check stays unprotected so monitoring doesn't depend on a DB
    // round-trip.
    consumer
      .apply(TenantResolverMiddleware)
      .exclude('api/health', 'api/health/(.*)')
      .forRoutes('*');
  }
}
