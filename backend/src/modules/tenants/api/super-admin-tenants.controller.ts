import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MinioService } from '../../../common/storage/minio.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SuperAdminTenantService } from '../application/super-admin-tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

/** Typed-confirmation payload for the irreversible hard-delete. */
class DeleteTenantDto {
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  confirmSlug!: string;
}

/** Logo upload constraints (B7.5). */
const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const LOGO_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/**
 * SUPER_ADMIN tenant CRUD (B6.10 + B7.5).
 *
 * Today : create (tenant + first ADMIN + seed), list (paginated), get,
 * patch (rename / change plan / activate / quota override), and logo
 * upload. Delete is intentionally NOT exposed here yet — wiping a tenant
 * cascades through every business table, and a UI-button-deletion of the
 * wrong tenant is the kind of mistake that ends a SaaS in one click. Add it
 * behind a SA-only confirmation flow (typed slug + double-prompt) when
 * actually needed.
 *
 * Subdomain : these routes live on /api/super-admin/tenants and are meant to
 * be called from auth.taskmgr.com (the operator console) — TenantResolver
 * still attaches the operator's own tenant to request.tenant, but the
 * responses ignore that scope (SA reaches across).
 */
@ApiTags('SuperAdmin')
@ApiBearerAuth('access-token')
@Roles(Role.SUPER_ADMIN)
@Controller('super-admin/tenants')
export class SuperAdminTenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: SuperAdminTenantService,
    private readonly minio: MinioService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un tenant (SA) — tenant + premier ADMIN + seeds',
    description:
      'Crée un Tenant (plan + quotas optionnels) avec son premier ADMIN et ' +
      'les seeds par défaut (process, types de tâches/clients/adresses), le ' +
      'tout dans une seule transaction. Le slug devient le sous-domaine.',
  })
  async create(@Body() dto: CreateTenantDto) {
    return this.tenantService.createTenant(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Liste paginée des tenants' })
  async list(@Query('page') page = '1', @Query('limit') limit = '20') {
    const skip = (Math.max(1, +page) - 1) * Math.max(1, +limit);
    const take = Math.min(100, Math.max(1, +limit));

    // SA reaches across — bypass the tenant-scope middleware via raw SQL.
    // The tenants table is not tenant-scoped itself so plain findMany would
    // work too, but going through raw makes the intent explicit ("here we
    // are explicitly cross-tenant").
    const [rowsRaw, totalRaw] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM tenants ORDER BY created_at DESC OFFSET $1 LIMIT $2`,
        skip,
        take,
      ),
      this.prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT count(*)::bigint AS c FROM tenants`,
      ),
    ]);

    const data = await Promise.all(
      rowsRaw.map((r) => this.withLogoUrl(camelCase(r))),
    );

    return {
      data,
      pagination: {
        page: +page,
        limit: take,
        total: Number(totalRaw[0]?.c ?? 0n),
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détails d\'un tenant' })
  async getOne(@Param('id') id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} introuvable`);
    }
    return this.withLogoUrl(tenant);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mettre à jour un tenant (renommer, changer de plan, quota, désactiver)',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Tenant ${id} introuvable`);
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: dto,
    });
    return this.withLogoUrl(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Supprimer DÉFINITIVEMENT un tenant et toutes ses données (SA, irréversible)',
    description:
      'Hard-delete en cascade de toutes les tables du tenant + purge des ' +
      'objets MinIO. Exige `confirmSlug` === slug du tenant. Refuse le tenant ' +
      'par défaut et tout tenant contenant un SUPER_ADMIN.',
  })
  async remove(@Param('id') id: string, @Body() dto: DeleteTenantDto) {
    return this.tenantService.deleteTenant(id, dto.confirmSlug);
  }

  @Post(':id/logo')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Téléverser le logo d\'un tenant (PNG/JPEG/WEBP/SVG, ≤ 2 Mo)',
  })
  async uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu (champ « file »).');
    }
    const ext = LOGO_MIME_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        'Format non supporté. Utilisez PNG, JPEG, WEBP ou SVG.',
      );
    }
    if (file.size > LOGO_MAX_BYTES) {
      throw new BadRequestException('Le logo dépasse la taille maximale (2 Mo).');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, logoStorageKey: true },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} introuvable`);
    }

    const key = `tenants/${id}/logo.${ext}`;
    await this.minio.uploadFile(file.buffer, key, file.mimetype, file.size);

    // Best-effort cleanup of a previous logo with a different extension.
    if (tenant.logoStorageKey && tenant.logoStorageKey !== key) {
      await this.minio
        .deleteFile(tenant.logoStorageKey)
        .catch(() => undefined);
    }

    await this.prisma.tenant.update({
      where: { id },
      data: { logoStorageKey: key },
    });

    return { logoStorageKey: key, logoUrl: await this.minio.getFileUrl(key) };
  }

  /**
   * Enriches a tenant row with a fresh presigned `logoUrl` (1 h TTL) when it
   * has a stored logo. Returns the row untouched (logoUrl = null) otherwise.
   */
  private async withLogoUrl<T extends { logoStorageKey?: string | null }>(
    tenant: T,
  ): Promise<T & { logoUrl: string | null }> {
    const logoUrl = tenant.logoStorageKey
      ? await this.minio.getFileUrl(tenant.logoStorageKey)
      : null;
    return { ...tenant, logoUrl };
  }
}

/** Maps a snake_case DB row to a camelCase JSON object. */
function camelCase(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = typeof v === 'bigint' ? Number(v) : v;
  }
  return out;
}
