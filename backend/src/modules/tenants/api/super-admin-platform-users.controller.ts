import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { i18nValidationMessage } from 'nestjs-i18n';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { DEFAULT_TENANT_ID } from '../../../common/contracts/tenant-context.contract';

/** Domain event names — picked up by the audit `platform.**` listener. */
export const PLATFORM_SUPER_ADMIN_CREATED = 'platform.super_admin.created';
export const PLATFORM_SUPER_ADMIN_UPDATED = 'platform.super_admin.updated';
export const PLATFORM_SUPER_ADMIN_PASSWORD_RESET = 'platform.super_admin.password_reset';
export const PLATFORM_SUPER_ADMIN_SUSPENDED = 'platform.super_admin.suspended';
export const PLATFORM_SUPER_ADMIN_REACTIVATED = 'platform.super_admin.reactivated';
export const PLATFORM_SUPER_ADMIN_TOTP_RESET = 'platform.super_admin.totp_reset';
export const PLATFORM_SUPER_ADMIN_DELETED = 'platform.super_admin.deleted';

/** Shape shared by every read/mutation on this controller. */
type PlatformSuperAdminRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: boolean;
  totp_enabled: boolean;
  created_at: Date;
  /** `preferences->>'locale'` — drives the language of security emails/SMS. */
  locale: string | null;
};

function toDto(r: PlatformSuperAdminRow) {
  return {
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    isActive: r.is_active,
    totpEnabled: r.totp_enabled,
    createdAt: r.created_at,
  };
}

const SA_COLUMNS =
  "id, email, first_name, last_name, phone, is_active, totp_enabled, created_at, preferences->>'locale' AS locale";

/**
 * Payload of the security events (`password_reset`, `totp_reset`) : the
 * notifications module sends an email + SMS to the affected SA from these
 * fields alone, without a cross-module lookup.
 */
function securityRecipient(r: PlatformSuperAdminRow) {
  return {
    email: r.email,
    phone: r.phone,
    firstName: r.first_name,
    locale: r.locale === 'en' ? 'en' : 'fr',
  };
}

class CreatePlatformSuperAdminDto {
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

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  phone?: string;
}

class UpdatePlatformSuperAdminDto {
  @IsOptional()
  @IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') })
  email?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  firstName?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(1, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  lastName?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  phone?: string | null;
}

class ResetPlatformSuperAdminPasswordDto {
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(8, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  newPassword!: string;
}

/**
 * Platform-level SUPER_ADMIN management (B7.6).
 *
 * Lets an existing SA provision additional SUPER_ADMINs from the UI
 * instead of going through the SUPER_ADMIN_EMAIL env bootstrap. Only
 * SAs can call this — anti-escalation : the route lives behind
 * @Roles(SUPER_ADMIN) and the role is hardcoded server-side (no DTO
 * field can override it).
 *
 * SAs are kept in the DEFAULT tenant by convention — they're a global
 * resource, not a per-tenant role. The existing bootstrap and the
 * impersonation flow already assume this.
 *
 * Raw SQL is used for the listing (and the email pre-check on create)
 * because the tenant-scope middleware would otherwise hide rows that
 * are not in the SA's "current" tenant context.
 */
@ApiTags('SuperAdmin')
@ApiBearerAuth('access-token')
@Roles(Role.SUPER_ADMIN)
@Controller('super-admin/platform-users')
export class SuperAdminPlatformUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liste des SUPER_ADMINs de la plateforme' })
  async list() {
    const rows = await this.prisma.$queryRawUnsafe<PlatformSuperAdminRow[]>(
      `SELECT ${SA_COLUMNS}
       FROM users
       WHERE role = 'SUPER_ADMIN'
       ORDER BY created_at ASC`,
    );
    return { data: rows.map(toDto) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un nouvel utilisateur SUPER_ADMIN (réservé aux SA)',
  })
  async create(
    @CurrentUser() actor: { id: string },
    @Body() dto: CreatePlatformSuperAdminDto,
  ) {
    // Email must be globally unique among SAs — they all live in
    // DEFAULT, so the per-tenant unique index already enforces this.
    type Row = { id: string };
    const clash = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id FROM users WHERE tenant_id = $1 AND email = $2 LIMIT 1`,
      DEFAULT_TENANT_ID,
      dto.email,
    );
    if (clash.length > 0) {
      throw new ConflictException(
        `L'email « ${dto.email} » est déjà utilisé sur la plateforme.`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // INSERT via raw SQL so the tenant-scope middleware doesn't
    // overwrite tenantId with the SA's active context.
    const created = await this.prisma.$queryRawUnsafe<PlatformSuperAdminRow[]>(
      `INSERT INTO users (
         id, tenant_id, email, password, first_name, last_name, role,
         phone, is_active, created_at, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, 'SUPER_ADMIN'::"Role",
         $6, true, NOW(), NOW()
       )
       RETURNING ${SA_COLUMNS}`,
      DEFAULT_TENANT_ID,
      dto.email,
      passwordHash,
      dto.firstName,
      dto.lastName,
      dto.phone ?? null,
    );

    if (created.length === 0) {
      throw new BadRequestException("Échec de la création — réessayez.");
    }
    const r = created[0];

    // Audit hook — picked up by the wildcard listener in the audit module.
    this.eventEmitter.emit(PLATFORM_SUPER_ADMIN_CREATED, {
      eventName: PLATFORM_SUPER_ADMIN_CREATED,
      occurredAt: new Date(),
      aggregateId: r.id,
      actorUserId: actor.id,
      tenantId: DEFAULT_TENANT_ID,
      data: { email: r.email, firstName: r.first_name, lastName: r.last_name },
    });

    return toDto(r);
  }

  // ── Mutations on an existing SA (B39) ──────────────────────────────────────
  //
  // Guard rails shared by every mutation :
  //   - the target must be a SUPER_ADMIN (404 otherwise — no probing of
  //     tenant users through this surface) ;
  //   - an SA cannot suspend or delete themself (403) ;
  //   - the platform must always keep at least one active SA (409).
  // Password reset, suspension and deletion revoke every refresh token of
  // the target so a live session ends at the next access-token expiry.

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier les informations d’un SUPER_ADMIN' })
  async update(
    @CurrentUser() actor: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlatformSuperAdminDto,
  ) {
    const current = await this.findSuperAdmin(id);

    if (dto.email && dto.email !== current.email) {
      const clash = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM users WHERE tenant_id = $1 AND email = $2 AND id <> $3 LIMIT 1`,
        DEFAULT_TENANT_ID,
        dto.email,
        id,
      );
      if (clash.length > 0) {
        throw new ConflictException(
          `L'email « ${dto.email} » est déjà utilisé sur la plateforme.`,
        );
      }
    }

    const rows = await this.prisma.$queryRawUnsafe<PlatformSuperAdminRow[]>(
      `UPDATE users
       SET email = COALESCE($2, email),
           first_name = COALESCE($3, first_name),
           last_name = COALESCE($4, last_name),
           phone = CASE WHEN $6::boolean THEN $5 ELSE phone END,
           updated_at = NOW()
       WHERE id = $1 AND role = 'SUPER_ADMIN'
       RETURNING ${SA_COLUMNS}`,
      id,
      dto.email ?? null,
      dto.firstName ?? null,
      dto.lastName ?? null,
      dto.phone ?? null,
      dto.phone !== undefined,
    );
    if (rows.length === 0) throw new NotFoundException('SUPER_ADMIN introuvable');

    this.emitPlatformEvent(PLATFORM_SUPER_ADMIN_UPDATED, id, actor.id, {
      changedFields: Object.keys(dto),
    });
    return toDto(rows[0]);
  }

  @Patch(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Définir un nouveau mot de passe (révoque les sessions actives)',
  })
  async resetPassword(
    @CurrentUser() actor: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPlatformSuperAdminPasswordDto,
  ) {
    const target = await this.findSuperAdmin(id);
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$executeRawUnsafe(
      `UPDATE users SET password = $2, updated_at = NOW()
       WHERE id = $1 AND role = 'SUPER_ADMIN'`,
      id,
      passwordHash,
    );
    await this.revokeSessions(id);
    this.emitPlatformEvent(PLATFORM_SUPER_ADMIN_PASSWORD_RESET, id, actor.id, {
      recipient: securityRecipient(target),
    });
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspendre un SUPER_ADMIN (révoque les sessions)' })
  async suspend(
    @CurrentUser() actor: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (id === actor.id) {
      throw new ForbiddenException('Impossible de suspendre son propre compte');
    }
    const target = await this.findSuperAdmin(id);
    if (target.is_active) await this.assertNotLastActive(id);

    const rows = await this.prisma.$queryRawUnsafe<PlatformSuperAdminRow[]>(
      `UPDATE users SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND role = 'SUPER_ADMIN'
       RETURNING ${SA_COLUMNS}`,
      id,
    );
    await this.revokeSessions(id);
    this.emitPlatformEvent(PLATFORM_SUPER_ADMIN_SUSPENDED, id, actor.id, {
      email: target.email,
    });
    return toDto(rows[0]);
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Réactiver un SUPER_ADMIN suspendu' })
  async reactivate(
    @CurrentUser() actor: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const target = await this.findSuperAdmin(id);
    const rows = await this.prisma.$queryRawUnsafe<PlatformSuperAdminRow[]>(
      `UPDATE users SET is_active = true, updated_at = NOW()
       WHERE id = $1 AND role = 'SUPER_ADMIN'
       RETURNING ${SA_COLUMNS}`,
      id,
    );
    this.emitPlatformEvent(PLATFORM_SUPER_ADMIN_REACTIVATED, id, actor.id, {
      email: target.email,
    });
    return toDto(rows[0]);
  }

  @Patch(':id/totp/reset')
  @ApiOperation({
    summary: 'Désactiver la 2FA d’un SUPER_ADMIN qui a perdu son authentificateur',
  })
  async resetTotp(
    @CurrentUser() actor: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const target = await this.findSuperAdmin(id);
    const rows = await this.prisma.$queryRawUnsafe<PlatformSuperAdminRow[]>(
      `UPDATE users
       SET totp_secret = NULL, totp_enabled = false, totp_backup_codes_hash = NULL,
           totp_enabled_at = NULL, totp_failed_attempts = 0, totp_locked_until = NULL,
           updated_at = NOW()
       WHERE id = $1 AND role = 'SUPER_ADMIN'
       RETURNING ${SA_COLUMNS}`,
      id,
    );
    this.emitPlatformEvent(PLATFORM_SUPER_ADMIN_TOTP_RESET, id, actor.id, {
      email: target.email,
      recipient: securityRecipient(target),
    });
    return toDto(rows[0]);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprimer définitivement un SUPER_ADMIN (409 si des données lui sont rattachées)',
  })
  async remove(
    @CurrentUser() actor: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (id === actor.id) {
      throw new ForbiddenException('Impossible de supprimer son propre compte');
    }
    const target = await this.findSuperAdmin(id);
    if (target.is_active) await this.assertNotLastActive(id);

    await this.revokeSessions(id);
    try {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM users WHERE id = $1 AND role = 'SUPER_ADMIN'`,
        id,
      );
    } catch (err) {
      // 23503 = foreign_key_violation : the SA authored rows that are kept
      // for history (work orders, notes, stock movements…). Suspension is the
      // right tool in that case ; we do not cascade-delete business data.
      if (isForeignKeyViolation(err)) {
        throw new ConflictException(
          'Ce SUPER_ADMIN a des données rattachées (historique). Suspendez-le plutôt que de le supprimer.',
        );
      }
      throw err;
    }
    this.emitPlatformEvent(PLATFORM_SUPER_ADMIN_DELETED, id, actor.id, {
      email: target.email,
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async findSuperAdmin(id: string): Promise<PlatformSuperAdminRow> {
    const rows = await this.prisma.$queryRawUnsafe<PlatformSuperAdminRow[]>(
      `SELECT ${SA_COLUMNS} FROM users WHERE id = $1 AND role = 'SUPER_ADMIN' LIMIT 1`,
      id,
    );
    if (rows.length === 0) throw new NotFoundException('SUPER_ADMIN introuvable');
    return rows[0];
  }

  private async assertNotLastActive(excludedId: string): Promise<void> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM users
       WHERE role = 'SUPER_ADMIN' AND is_active = true AND id <> $1`,
      excludedId,
    );
    if ((rows[0]?.count ?? 0) === 0) {
      throw new ConflictException(
        'La plateforme doit conserver au moins un SUPER_ADMIN actif.',
      );
    }
  }

  /** Ends every live session of the target (refresh rotation stops working). */
  private async revokeSessions(userId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      userId,
    );
  }

  private emitPlatformEvent(
    eventName: string,
    aggregateId: string,
    actorUserId: string,
    data: Record<string, unknown>,
  ): void {
    this.eventEmitter.emit(eventName, {
      eventName,
      occurredAt: new Date(),
      aggregateId,
      actorUserId,
      tenantId: DEFAULT_TENANT_ID,
      data,
    });
  }
}

function isForeignKeyViolation(err: unknown): boolean {
  const e = err as { code?: string; meta?: { code?: string }; message?: string };
  return (
    e?.code === '23503' ||
    e?.meta?.code === '23503' ||
    (typeof e?.message === 'string' && e.message.includes('23503'))
  );
}
