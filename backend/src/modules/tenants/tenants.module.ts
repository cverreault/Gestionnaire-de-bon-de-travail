import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { QuotaService } from './application/quota.service';
import { QuotaResetService } from './application/quota-reset.service';
import { SignupService } from './application/signup.service';
import { SuperAdminTenantService } from './application/super-admin-tenant.service';
import { TenantBootstrapService } from './application/tenant-bootstrap.service';
import { PlansService } from './application/plans.service';
import { PeakTrackerService } from './application/peak-tracker.service';
import { SignupController } from './api/signup.controller';
import { SuperAdminTenantsController } from './api/super-admin-tenants.controller';
import { TenantBrandingController } from './api/tenant-branding.controller';
import { ImpersonateController } from './api/impersonate.controller';
import { SuperAdminStatsController } from './api/super-admin-stats.controller';
import { SuperAdminAuditController } from './api/super-admin-audit.controller';
import { SuperAdminUsersController } from './api/super-admin-users.controller';
import { SuperAdminAllUsersController } from './api/super-admin-all-users.controller';
import { SuperAdminPlatformUsersController } from './api/super-admin-platform-users.controller';
import { SuperAdminPlansController } from './api/super-admin-plans.controller';
import { TenantSubscriptionController } from './api/tenant-subscription.controller';
import { TenantApiKeysController } from './api/tenant-api-keys.controller';
import { PrimaryAdminGuard } from '../../common/guards/primary-admin.guard';
import { QUOTA_SERVICE } from '../../common/contracts/quota.contract';

/**
 * Tenants module (B6).
 *
 * Currently exposes QuotaService + the monthly reset cron. The SA
 * CRUD endpoints (B6.10) and self-service signup (B6.7) hang off this
 * module too once shipped.
 *
 * @Global because every business module needs to call
 * QuotaService.checkAndConsume() before creating users / clients /
 * work orders / attachments.
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    // Local JWT registration so the SA impersonate controller can sign
    // tokens without importing AuthModule (no cross-module business
    // import). Uses the same JWT_SECRET / expiresIn as AuthModule.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    SignupController,
    SuperAdminTenantsController,
    TenantBrandingController,
    ImpersonateController,
    SuperAdminStatsController,
    SuperAdminAuditController,
    SuperAdminUsersController,
    SuperAdminAllUsersController,
    SuperAdminPlatformUsersController,
    SuperAdminPlansController,
    TenantSubscriptionController,
    TenantApiKeysController,
  ],
  providers: [
    QuotaService,
    QuotaResetService,
    SignupService,
    SuperAdminTenantService,
    TenantBootstrapService,
    PlansService,
    PeakTrackerService,
    PrimaryAdminGuard,
    { provide: QUOTA_SERVICE, useExisting: QuotaService },
  ],
  exports: [QuotaService, QUOTA_SERVICE],
})
export class TenantsModule {}
