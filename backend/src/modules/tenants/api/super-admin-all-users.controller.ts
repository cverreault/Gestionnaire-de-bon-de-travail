import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { QuotaType } from '../../../common/contracts/quota.contract';
import { Roles } from '../../../common/decorators/roles.decorator';
import { QuotaService } from '../application/quota.service';

/** Roles the SA may assign to a tenant user (never SUPER_ADMIN). */
const ASSIGNABLE_ROLES = [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN];

class CreateUserBySuperAdminDto {
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  tenantId!: string;

  @IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') })
  email!: string;

  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(8, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  password!: string;

  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  firstName!: string;

  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  lastName!: string;

  // Anti-escalation: SUPER_ADMIN is excluded from the assignable set.
  @IsEnum(ASSIGNABLE_ROLES, {
    message: i18nValidationMessage('validation.IS_ENUM'),
  })
  role!: Role;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  phone?: string;

  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.IS_BOOLEAN') })
  isActive?: boolean;
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un utilisateur dans un tenant (SA) — respecte le quota',
  })
  async create(@Body() dto: CreateUserBySuperAdminDto) {
    // Target tenant must exist and be active.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: { id: true, isActive: true },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${dto.tenantId} introuvable`);
    }
    if (!tenant.isActive) {
      throw new BadRequestException(
        'Tenant désactivé — réactivez-le avant d\'y créer un utilisateur',
      );
    }

    // Email is unique per tenant — friendly pre-check before consuming
    // quota. Raw SQL because the tenant-scope middleware rewrites
    // `where.tenantId` to the SA's own tenant, which would let a clashing
    // email in the target tenant slip through, and then crash on the unique
    // index when we INSERT.
    const clashRows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM users WHERE tenant_id = $1 AND email = $2 LIMIT 1`,
      dto.tenantId,
      dto.email,
    );
    if (clashRows.length > 0) {
      throw new ConflictException(
        `L'email « ${dto.email} » existe déjà dans ce tenant.`,
      );
    }

    // Atomic check + consume of the USERS quota. Throws 403 if the ceiling
    // is reached — the SA can raise maxUsers first.
    await this.quota.checkAndConsume(QuotaType.USERS, dto.tenantId);

    try {
      const passwordHash = await bcrypt.hash(dto.password, 10);
      // Raw INSERT for the same reason as above — the middleware would
      // overwrite tenantId on create.
      type Row = {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: Role;
        is_active: boolean;
        phone: string | null;
        tenant_id: string;
      };
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(
        `INSERT INTO users (
           id, tenant_id, email, password, first_name, last_name, role,
           phone, is_active, created_at, updated_at
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6::"Role",
           $7, $8, NOW(), NOW()
         )
         RETURNING id, email, first_name, last_name, role, is_active, phone, tenant_id`,
        dto.tenantId,
        dto.email,
        passwordHash,
        dto.firstName,
        dto.lastName,
        dto.role,
        dto.phone ?? null,
        dto.isActive ?? true,
      );
      const r = rows[0];
      return {
        id: r.id,
        email: r.email,
        firstName: r.first_name,
        lastName: r.last_name,
        role: r.role,
        isActive: r.is_active,
        phone: r.phone,
        tenantId: r.tenant_id,
      };
    } catch (err) {
      // Creation failed after we already consumed a slot — give it back so
      // the counter doesn't drift (e.g. the unique index lost a race).
      await this.quota.release(QuotaType.USERS, dto.tenantId).catch(() => undefined);
      throw err;
    }
  }

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
    // Raw SQL : the tenant-scope middleware would otherwise reject the
    // lookup with "not found" whenever the user lives in a different
    // tenant than the SA's own context — which is most of the time.
    type ExistingRow = { id: string; role: Role; email: string; tenant_id: string };
    const existingRows = await this.prisma.$queryRawUnsafe<ExistingRow[]>(
      `SELECT id, role, email, tenant_id FROM users WHERE id = $1 LIMIT 1`,
      id,
    );
    const existing = existingRows[0];
    if (!existing) {
      throw new NotFoundException(`Utilisateur ${id} introuvable`);
    }
    if (existing.role === Role.SUPER_ADMIN) {
      throw new BadRequestException(
        'Impossible de modifier un SUPER_ADMIN via cette route',
      );
    }

    // If the SA is moving a user across tenants, validate the target
    // tenant exists + isn't suspended. Tenant model is not scoped by
    // the middleware so Prisma is fine here.
    if (dto.tenantId && dto.tenantId !== existing.tenant_id) {
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

    // Raw UPDATE so the middleware doesn't narrow `where` to the SA's
    // tenant and silently match nothing.
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (sql: string, value: unknown) => {
      params.push(value);
      sets.push(sql.replace('?', `$${params.length}`));
    };
    if (dto.tenantId !== undefined) push('tenant_id = ?', dto.tenantId);
    if (dto.role !== undefined) push(`role = ?::"Role"`, dto.role);
    if (dto.isActive !== undefined) push('is_active = ?', dto.isActive);
    sets.push('updated_at = NOW()');
    params.push(id);

    type ReturnRow = {
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      role: Role;
      is_active: boolean;
      tenant_id: string;
    };
    const updated = await this.prisma.$queryRawUnsafe<ReturnRow[]>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, email, first_name, last_name, role, is_active, tenant_id`,
      ...params,
    );
    const r = updated[0];
    return {
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      role: r.role,
      isActive: r.is_active,
      tenantId: r.tenant_id,
    };
  }
}
