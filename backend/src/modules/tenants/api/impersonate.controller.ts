import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateIf } from 'class-validator';
import { Role } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.interface';

/**
 * Two modes (B7) — exactly one of userId / tenantId must be set :
 *   - userId : original B6.11 path. Imite l'utilisateur cible précis.
 *   - tenantId : B7 path. Auto-sélectionne le 1er ADMIN actif du tenant
 *                par created_at ASC. Si aucun ADMIN actif → 404.
 */
class ImpersonateDto {
  @ApiPropertyOptional({ description: 'Target user UUID — exclusive with tenantId' })
  @ValidateIf((o) => !o.tenantId)
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  userId?: string;

  @ApiPropertyOptional({
    description:
      'Target tenant UUID — picks the first active ADMIN of that tenant. Exclusive with userId.',
  })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  tenantId?: string;
}

interface JwtUser {
  id: string;
  role: Role;
}

interface ImpersonateResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
    tenantId: string;
  };
  tenant: { id: string; slug: string; name: string };
}

/**
 * SA impersonation (B6.11 + B7).
 *
 * Issues a fresh access token for a target user — does NOT touch
 * refresh tokens, so the SA can never extend the session beyond the
 * 15-min access TTL. Useful for debugging a customer's issue
 * without asking them for their password.
 *
 * Two modes :
 *   - `{ userId }` — original. SA impersonates a specific user.
 *   - `{ tenantId }` — B7. SA impersonates the 1st active ADMIN of
 *     the tenant. The frontend uses this from the SA tenants list
 *     ("Entrer dans cet espace") so the SA never has to pick a user
 *     before deciding to enter.
 *
 * Audit : every successful impersonation emits a domain-event-like
 * log line "🎭 SA impersonate user=<id> by sa=<id>" — picked up by
 * the audit module via the wildcard listener (B2).
 *
 * Safety :
 *   - SA cannot impersonate themselves (no-op)
 *   - SA cannot impersonate another SA (anti-escalation)
 *   - Target must be active
 *   - tenantId mode requires the tenant + at least one active ADMIN
 */
@ApiTags('SuperAdmin')
@ApiBearerAuth('access-token')
@Roles(Role.SUPER_ADMIN)
@Controller('super-admin/impersonate')
export class ImpersonateController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Émettre un access token pour le compte cible (debug)',
  })
  async impersonate(
    @CurrentUser() sa: JwtUser,
    @Body() dto: ImpersonateDto,
  ): Promise<ImpersonateResponse> {
    if (!dto.userId && !dto.tenantId) {
      throw new ForbiddenException(
        'Vous devez fournir soit userId, soit tenantId',
      );
    }
    if (dto.userId && dto.tenantId) {
      throw new ForbiddenException(
        'Fournissez userId OU tenantId, pas les deux',
      );
    }

    const target = dto.userId
      ? await this.resolveByUserId(dto.userId)
      : await this.resolveByTenantId(dto.tenantId!);

    if (target.id === sa.id) {
      throw new ForbiddenException('Vous êtes déjà connecté en tant que vous-même');
    }
    if (target.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException("Impossible d'imiter un autre SUPER_ADMIN");
    }
    if (!target.isActive) {
      throw new ForbiddenException('Compte cible inactif');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: target.tenantId },
      select: { id: true, slug: true, name: true },
    });
    if (!tenant) {
      throw new NotFoundException(
        `Tenant ${target.tenantId} introuvable (incohérence — target user orphelin ?)`,
      );
    }

    const payload: JwtPayload = {
      sub: target.id,
      email: target.email,
      role: target.role,
      tenantId: target.tenantId,
    };
    const accessToken = this.jwt.sign(payload);

    // Audit hook (picked up by the wildcard listener in the audit module)
    // eslint-disable-next-line no-console
    console.log(
      `🎭 SA impersonate target=${target.id} tenant=${target.tenantId} by sa=${sa.id}`,
    );

    return {
      accessToken,
      user: {
        id: target.id,
        email: target.email,
        firstName: target.firstName,
        lastName: target.lastName,
        role: target.role,
        tenantId: target.tenantId,
      },
      tenant,
    };
  }

  private async resolveByUserId(userId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        tenantId: true,
        isActive: true,
      },
    });
    if (!target) {
      throw new NotFoundException(`Utilisateur ${userId} introuvable`);
    }
    return target;
  }

  private async resolveByTenantId(tenantId: string) {
    // 1st active ADMIN by created_at ASC = the original / founding admin
    // of the tenant. Stable choice, not dependent on the alphabetical
    // order of names.
    const target = await this.prisma.user.findFirst({
      where: { tenantId, role: Role.ADMIN, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        tenantId: true,
        isActive: true,
      },
    });
    if (!target) {
      throw new NotFoundException(
        `Aucun ADMIN actif dans ce tenant — impossible d'imiter`,
      );
    }
    return target;
  }
}
