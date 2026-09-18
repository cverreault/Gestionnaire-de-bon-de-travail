import { Controller, Get, Headers } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Public } from '../../../common/decorators/public.decorator';
import { extractTenantSlug } from '../../../common/contracts/tenant-context.contract';
import { MobileConfigService } from '../application/config/mobile-config.service';

const BACKEND_VERSION = process.env.npm_package_version ?? process.env.APP_VERSION ?? 'dev';

/**
 * B37.8 — public bootstrap configuration for the app (ADR-014 §3, ADR-015 §5).
 * Called from the workspace screen before any login: version policy, tenant
 * name (from the Host, like `/tenants/branding`), limits and feature flags.
 * Never returns anything sensitive.
 */
@ApiTags('Mobile')
@Controller('mobile')
export class MobileConfigController {
  constructor(
    private readonly config: MobileConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('config')
  @ApiOperation({ summary: "Configuration publique de l'app mobile (versions minimales, tenant, limites)" })
  async getConfig(@Headers('host') host?: string) {
    const policy = await this.config.versionPolicy();
    const slug = extractTenantSlug(host);
    const tenant = slug
      ? await this.prisma.tenant.findUnique({ where: { slug }, select: { slug: true, name: true, isActive: true } })
      : null;
    return {
      ...policy,
      tenant: tenant && tenant.isActive ? { slug: tenant.slug, name: tenant.name } : null,
      features: { offlineSync: false, backgroundGps: false, push: false, signatures: false, parts: false },
      limits: { attachmentMaxBytes: 10 * 1024 * 1024, locationBatchMax: 100, syncPageMax: 200 },
      push: { provider: 'EXPO' },
      serverTime: new Date().toISOString(),
      backendVersion: BACKEND_VERSION,
    };
  }
}
