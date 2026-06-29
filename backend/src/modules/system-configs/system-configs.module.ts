import { Module } from '@nestjs/common';
import { SystemConfigService } from './application/system-config.service';
import { SuperAdminController } from './api/super-admin.controller';

/**
 * Platform-level config store (SA.1.b/SA.2).
 *
 * Exports SystemConfigService so any module can route reads through
 * resolve(key) — DB row > env var > undefined. The SuperAdminController
 * surfaces CRUD endpoints under /api/super-admin/configs gated to
 * SUPER_ADMIN role.
 */
@Module({
  controllers: [SuperAdminController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigsModule {}
