import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../../../common/contracts/tenant-context.contract';
import { SYSTEM_CONFIG_RESOLVER, type ISystemConfigResolver } from '../../../common/contracts/system-config-resolver.contract';
import { UpdateTenantSettingsDto } from './dto/tenant-settings.dto';

const SETTINGS_SELECT = { completedJobsEmail: true, baseAddress: true, baseLat: true, baseLng: true } as const;

/**
 * B48 — company settings of the current tenant (ADMIN) :
 *   - `completedJobsEmail` : one address that receives a summary of every completed job ;
 *   - `baseAddress` (+ coordinates from the address autocomplete) : where the
 *     technicians start from, used for the round-trip mileage of each job.
 * `emailConfigured` tells the UI whether SMTP is set up (otherwise emails only reach the server log).
 */
@ApiTags('Tenants')
@ApiBearerAuth('access-token')
@Controller('tenants/settings')
export class TenantSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SYSTEM_CONFIG_RESOLVER) private readonly configs: ISystemConfigResolver,
  ) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "[Admin] Réglages d'entreprise (courriel des travaux complétés, adresse de départ)" })
  async get(@CurrentTenant() tenant: TenantContext) {
    const row = await this.prisma.tenant.findUnique({ where: { id: tenant.id }, select: SETTINGS_SELECT });
    const smtpHost = await this.configs.resolve('smtp.host', 'SMTP_HOST');
    return { ...row, emailConfigured: !!smtpHost };
  }

  @Patch()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "[Admin] Modifier les réglages d'entreprise" })
  async update(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateTenantSettingsDto) {
    const data: Record<string, unknown> = {};
    if (dto.completedJobsEmail !== undefined) data.completedJobsEmail = dto.completedJobsEmail?.trim() || null;
    if (dto.baseAddress !== undefined) {
      data.baseAddress = dto.baseAddress?.trim() || null;
      // Coordinates travel with the address : a new text without coordinates resets them.
      data.baseLat = dto.baseLat ?? null;
      data.baseLng = dto.baseLng ?? null;
    } else if (dto.baseLat !== undefined || dto.baseLng !== undefined) {
      data.baseLat = dto.baseLat ?? null;
      data.baseLng = dto.baseLng ?? null;
    }
    const row = await this.prisma.tenant.update({ where: { id: tenant.id }, data, select: SETTINGS_SELECT });
    const smtpHost = await this.configs.resolve('smtp.host', 'SMTP_HOST');
    return { ...row, emailConfigured: !!smtpHost };
  }
}
