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
import { IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload.interface';

class ImpersonateDto {
  @ApiProperty({ description: 'Target user UUID' })
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  userId!: string;
}

interface JwtUser {
  id: string;
  role: Role;
}

/**
 * SA impersonation (B6.11).
 *
 * Issues a fresh access token for a target user — does NOT touch
 * refresh tokens, so the SA can never extend the session beyond the
 * 15-min access TTL. Useful for debugging a customer's issue
 * without asking them for their password.
 *
 * Audit : every successful impersonation emits a domain-event-like
 * log line "🎭 SA impersonate user=<id> by sa=<id>" — picked up by
 * the audit module via the wildcard listener (B2). Future hardening
 * could elevate this to a proper domain event with structured data.
 *
 * Safety :
 *   - SA cannot impersonate themselves (no-op)
 *   - SA cannot impersonate another SA (anti-escalation)
 *   - Target must be active
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
  ): Promise<{ accessToken: string; user: { id: string; email: string; tenantId: string } }> {
    if (dto.userId === sa.id) {
      throw new ForbiddenException('Vous êtes déjà connecté en tant que vous-même');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, email: true, role: true, tenantId: true, isActive: true },
    });

    if (!target) {
      throw new NotFoundException(`Utilisateur ${dto.userId} introuvable`);
    }
    if (target.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Impossible d\'imiter un autre SUPER_ADMIN');
    }
    if (!target.isActive) {
      throw new ForbiddenException('Compte cible inactif');
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
        tenantId: target.tenantId,
      },
    };
  }
}
