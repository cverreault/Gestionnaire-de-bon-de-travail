import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { QuotaService } from './application/quota.service';
import { QuotaResetService } from './application/quota-reset.service';
import { SignupService } from './application/signup.service';
import { TenantBootstrapService } from './application/tenant-bootstrap.service';
import { SignupController } from './api/signup.controller';
import { SuperAdminTenantsController } from './api/super-admin-tenants.controller';
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
  imports: [PrismaModule],
  controllers: [SignupController, SuperAdminTenantsController],
  providers: [
    QuotaService,
    QuotaResetService,
    SignupService,
    TenantBootstrapService,
    { provide: QUOTA_SERVICE, useExisting: QuotaService },
  ],
  exports: [QuotaService, QUOTA_SERVICE],
})
export class TenantsModule {}
