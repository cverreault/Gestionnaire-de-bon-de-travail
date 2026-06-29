import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UpdateTenantDto } from './dto/update-tenant.dto';

/**
 * SUPER_ADMIN tenant CRUD (B6.10).
 *
 * Today : list (paginated) + get + patch (rename / change plan /
 * activate / quota override). Delete is intentionally NOT exposed
 * here yet — wiping a tenant cascades through every business table,
 * and a UI-button-deletion of the wrong tenant is the kind of
 * mistake that ends a SaaS in one click. Add it behind a SA-only
 * confirmation flow (typed slug + double-prompt) when actually
 * needed.
 *
 * Subdomain : these routes live on /api/super-admin/tenants and are
 * meant to be called from auth.taskmgr.com (the operator console)
 * — TenantResolver still attaches the operator's own tenant to
 * request.tenant, but the responses ignore that scope (SA reaches
 * across).
 */
@ApiTags('SuperAdmin')
@ApiBearerAuth('access-token')
@Roles(Role.SUPER_ADMIN)
@Controller('super-admin/tenants')
export class SuperAdminTenantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liste paginée des tenants' })
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const skip = (Math.max(1, +page) - 1) * Math.max(1, +limit);
    const take = Math.min(100, Math.max(1, +limit));

    // SA reaches across — bypass the tenant-scope middleware via raw
    // SQL. The tenants table is not tenant-scoped itself so plain
    // findMany would work too, but going through raw makes the intent
    // explicit ("here we are explicitly cross-tenant").
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

    return {
      data: rowsRaw.map(camelCase),
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
    return tenant;
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

    return this.prisma.tenant.update({
      where: { id },
      data: dto,
    });
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
