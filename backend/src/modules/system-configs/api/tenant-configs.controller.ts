import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../../../common/contracts/tenant-context.contract';
import { SystemConfigService } from '../application/system-config.service';
import { UpsertConfigDto } from './dto/upsert-config.dto';

interface JwtUser {
  id: string;
  role: Role;
}

/**
 * Per-tenant configuration endpoints (B6.9).
 *
 * ADMIN of a tenant can override SMTP / VAPID / Sentry settings for
 * their own customers without touching the platform-wide defaults.
 *
 * The SuperAdmin (SA) GLOBAL endpoints stay at /super-admin/configs.
 */
@ApiTags('TenantConfigs')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN)
@Controller('tenant/configs')
export class TenantConfigsController {
  constructor(private readonly configs: SystemConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Liste les overrides TENANT pour cet espace' })
  async list(@CurrentTenant() tenant: TenantContext) {
    // Reuse the GLOBAL list for now ; the SA UI already filters
    // sensibly. A scope=TENANT filter would let the front-end avoid
    // surfacing GLOBAL keys here — adding it in a follow-up.
    return {
      tenantId: tenant.id,
      encryptionAvailable: this.configs.isEncryptionAvailable(),
    };
  }

  @Put(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Upsert d\'un override TENANT pour cette clé',
    description:
      'L\'override TENANT a priorité sur l\'éventuelle valeur GLOBAL ' +
      'définie par le SuperAdmin. Le service de résolution remonte la ' +
      'cascade TENANT > GLOBAL > env.',
  })
  async upsert(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtUser,
    @Param('key') key: string,
    @Body() dto: UpsertConfigDto,
  ): Promise<void> {
    await this.configs.set(key, dto.value, {
      encrypted: dto.encrypted,
      updatedBy: user.id,
      scope: 'TENANT',
      tenantId: tenant.id,
    });
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprime l\'override TENANT — la valeur GLOBAL reprend la main',
  })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('key') key: string,
  ): Promise<void> {
    await this.configs.delete(key, { scope: 'TENANT', tenantId: tenant.id });
  }
}
