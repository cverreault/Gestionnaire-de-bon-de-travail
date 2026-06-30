import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Role } from '@prisma/client';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Roles } from '../../../common/decorators/roles.decorator';

class UpdateUserBySuperAdminDto {
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  tenantId?: string;

  /**
   * SA cannot promote a regular user to SUPER_ADMIN through this
   * route — that path stays through the bootstrap (SUPER_ADMIN_EMAIL
   * env). Anti-escalation : the enum below excludes SUPER_ADMIN.
   */
  @IsOptional()
  @IsEnum([Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  role?: Role;

  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isActive?: boolean;
}

/**
 * Cross-tenant user management (B7 follow-up).
 *
 * GET /super-admin/all-users — paginated list of every user with
 * its tenant attached. Optional filters : email substring + tenantId.
 *
 * PATCH /super-admin/all-users/:id — change tenantId, role
 * (ADMIN/DISPATCHER/TECHNICIAN only — SUPER_ADMIN is bootstrap-only)
 * and/or isActive.
 *
 * Both endpoints reach across tenants via raw SQL (list) / explicit
 * tenantId update (patch). The tenant-scope middleware would
 * otherwise hide rows the SA needs to manage.
 */
@ApiTags('SuperAdmin')
@ApiBearerAuth('access-token')
@Roles(Role.SUPER_ADMIN)
@Controller('super-admin/all-users')
export class SuperAdminAllUsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liste paginée de tous les users (tous tenants confondus)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'email', required: false, description: 'Filtre substring case-insensitive' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Filtre par tenant' })
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('email') email?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const take = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
    const skip = (Math.max(1, Number.parseInt(page, 10) || 1) - 1) * take;

    const clauses: string[] = [];
    const params: unknown[] = [];
    const push = (sql: string, value: unknown) => {
      params.push(value);
      clauses.push(sql.replace('?', `$${params.length}`));
    };
    if (email && email.trim()) push(`LOWER(u.email) LIKE LOWER(?) || '%'`, email.trim());
    if (tenantId) push(`u.tenant_id = ?`, tenantId);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    type Row = {
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: Role;
      is_active: boolean;
      created_at: Date;
      tenant_id: string;
      tenant_slug: string;
      tenant_name: string;
    };

    const [rows, totalRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active, u.created_at,
                t.id AS tenant_id, t.slug AS tenant_slug, t.name AS tenant_name
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         ${where}
         ORDER BY u.created_at DESC
         OFFSET $${params.length + 1} LIMIT $${params.length + 2}`,
        ...params,
        skip,
        take,
      ),
      this.prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT count(*)::bigint AS c FROM users u ${where}`,
        ...params,
      ),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        email: r.email,
        firstName: r.first_name,
        lastName: r.last_name,
        role: r.role,
        isActive: r.is_active,
        createdAt: r.created_at,
        tenant: {
          id: r.tenant_id,
          slug: r.tenant_slug,
          name: r.tenant_name,
        },
      })),
      pagination: {
        page: Number.parseInt(page, 10) || 1,
        limit: take,
        total: Number(totalRows[0]?.c ?? 0n),
      },
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Modifier un user — changer son tenantId / role / isActive (SA only)',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserBySuperAdminDto,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true, tenantId: true },
    });
    if (!existing) {
      throw new NotFoundException(`Utilisateur ${id} introuvable`);
    }
    if (existing.role === Role.SUPER_ADMIN) {
      throw new BadRequestException(
        'Impossible de modifier un SUPER_ADMIN via cette route',
      );
    }

    // If the SA is moving a user across tenants, validate the target
    // tenant exists + isn't suspended.
    if (dto.tenantId && dto.tenantId !== existing.tenantId) {
      const target = await this.prisma.tenant.findUnique({
        where: { id: dto.tenantId },
        select: { id: true, isActive: true },
      });
      if (!target) {
        throw new NotFoundException(
          `Tenant cible ${dto.tenantId} introuvable`,
        );
      }
      if (!target.isActive) {
        throw new BadRequestException(
          'Tenant cible désactivé — réactivez-le avant d\'y déplacer un user',
        );
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.tenantId !== undefined ? { tenantId: dto.tenantId } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        tenantId: true,
      },
    });
  }
}
