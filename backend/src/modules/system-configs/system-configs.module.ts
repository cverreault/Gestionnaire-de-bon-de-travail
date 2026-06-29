import { Module } from '@nestjs/common';
import { SystemConfigService } from './application/system-config.service';

/**
 * Platform-level config store (SA.1.b).
 *
 * Exports SystemConfigService so any module can route reads through
 * resolve(key) — DB row > env var > undefined. Consumer refactor lands
 * in SA.2 alongside the super-admin UI.
 *
 * No controller yet: writes happen via the super-admin endpoints in
 * SA.2. Until then it's a foundation layer with tests.
 */
@Module({
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigsModule {}
