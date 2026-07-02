import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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

/** Domain event name — picked up by the audit wildcard listener. */
export const PLATFORM_SUPER_ADMIN_CREATED = 'platform.super_admin.created';

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
    type Row = {
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      is_active: boolean;
      created_at: Date;
    };
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, email, first_name, last_name, phone, is_active, created_at
       FROM users
       WHERE role = 'SUPER_ADMIN'
       ORDER BY created_at ASC`,
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        email: r.email,
        firstName: r.first_name,
        lastName: r.last_name,
        phone: r.phone,
        isActive: r.is_active,
        createdAt: r.created_at,
      })),
    };
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
    const created = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        is_active: boolean;
        created_at: Date;
      }>
    >(
      `INSERT INTO users (
         id, tenant_id, email, password, first_name, last_name, role,
         phone, is_active, created_at, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, 'SUPER_ADMIN'::"Role",
         $6, true, NOW(), NOW()
       )
       RETURNING id, email, first_name, last_name, phone, is_active, created_at`,
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

    return {
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      isActive: r.is_active,
      createdAt: r.created_at,
    };
  }
}
