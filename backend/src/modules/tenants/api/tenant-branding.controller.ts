import { Controller, Get, Headers } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MinioService } from '../../../common/storage/minio.service';
import { Public } from '../../../common/decorators/public.decorator';
import { extractTenantSlug } from '../../../common/contracts/tenant-context.contract';

interface TenantBranding {
  /** null when no tenant subdomain is in play (apex / auth / reserved). */
  slug: string | null;
  /** Display name to show on the login screen. */
  name: string;
  /** Presigned logo URL (1 h TTL) or null when the tenant has no logo. */
  logoUrl: string | null;
}

/**
 * Public per-tenant branding (B7.5).
 *
 * The login page lives on `<slug>.<domain>` and must show the tenant's name
 * + logo *before* anyone authenticates. This unauthenticated endpoint
 * resolves the tenant from the Host header (same rule as TenantResolver) and
 * returns just enough to brand the screen — never anything sensitive.
 *
 * On the apex / `auth.` / reserved subdomains no tenant is derivable, so it
 * returns the generic TaskMgr branding and the UI falls back to its default
 * mark.
 */
@ApiTags('Tenants')
@Controller('tenants')
export class TenantBrandingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  @Public()
  @Get('branding')
  @ApiOperation({
    summary: 'Branding public du tenant (nom + logo) résolu par sous-domaine',
  })
  async branding(@Headers('host') host?: string): Promise<TenantBranding> {
    const generic: TenantBranding = { slug: null, name: 'TaskMgr', logoUrl: null };

    const slug = extractTenantSlug(host);
    if (!slug) return generic;

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { slug: true, name: true, isActive: true, logoStorageKey: true },
    });
    // Unknown or suspended tenant → generic branding (no enumeration leak).
    if (!tenant || !tenant.isActive) return generic;

    return {
      slug: tenant.slug,
      name: tenant.name,
      logoUrl: tenant.logoStorageKey
        ? await this.minio.getFileUrl(tenant.logoStorageKey)
        : null,
    };
  }
}
