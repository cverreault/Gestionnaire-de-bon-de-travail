import { Global, Module } from '@nestjs/common';
import { SystemConfigService } from './application/system-config.service';
import { SuperAdminController } from './api/super-admin.controller';
import { TenantConfigsController } from './api/tenant-configs.controller';
import { SYSTEM_CONFIG_RESOLVER } from '../../common/contracts/system-config-resolver.contract';

/**
 * Platform-level config store (SA.1.b/SA.2).
 *
 * Exports SystemConfigService so any module can route reads through
 * resolve(key) — DB row > env var > undefined. The SuperAdminController
 * surfaces CRUD endpoints under /api/super-admin/configs gated to
 * SUPER_ADMIN role.
 *
 * `@Global()` because the resolver is cross-cutting infrastructure
 * (like PrismaService) — consumers depend on the contract via the
 * SYSTEM_CONFIG_RESOLVER token from `common/contracts/`, not on this
 * module directly. That keeps `arch:check` (depcruise) clean.
 */
@Global()
@Module({
  controllers: [SuperAdminController, TenantConfigsController],
  providers: [
    SystemConfigService,
    { provide: SYSTEM_CONFIG_RESOLVER, useExisting: SystemConfigService },
  ],
  exports: [SystemConfigService, SYSTEM_CONFIG_RESOLVER],
})
export class SystemConfigsModule {}
