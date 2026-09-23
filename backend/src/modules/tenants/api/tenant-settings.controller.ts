import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../../../common/contracts/tenant-context.contract';
import { SYSTEM_CONFIG_RESOLVER, type ISystemConfigResolver } from '../../../common/contracts/system-config-resolver.contract';
import { UpdateTenantSettingsDto } from './dto/tenant-settings.dto';
import { CreateDeparturePointDto } from './dto/departure-point.dto';

const POINT_SELECT = { id: true, label: true, address: true, lat: true, lng: true, sortOrder: true } as const;

/**
 * B48 / B49.2 — company settings of the current tenant (ADMIN) :
 *   - `completedJobsEmail` : one address that receives a summary of every completed job ;
 *   - `departurePoints` : predefined starting points offered when computing a job's mileage
 *     (read by every staff role for the picker).
 * `emailConfigured` tells the UI whether SMTP is set up.
 */
/** B59 — accepts only zones the runtime can format in. */
function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

@ApiTags('Tenants')
@ApiBearerAuth('access-token')
@Controller('tenants/settings')
export class TenantSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SYSTEM_CONFIG_RESOLVER) private readonly configs: ISystemConfigResolver,
  ) {}

  private async payload(tenantId: string) {
    const [row, points, smtpHost] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { completedJobsEmail: true, timezone: true } }),
      this.prisma.departurePoint.findMany({ where: { tenantId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: POINT_SELECT }),
      this.configs.resolve('smtp.host', 'SMTP_HOST'),
    ]);
    return { ...row, departurePoints: points, emailConfigured: !!smtpHost };
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "[Admin] Réglages d'entreprise (courriel des travaux complétés, points de départ)" })
  get(@CurrentTenant() tenant: TenantContext) {
    return this.payload(tenant.id);
  }

  @Patch()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "[Admin] Modifier les réglages d'entreprise" })
  async update(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateTenantSettingsDto) {
    if (dto.completedJobsEmail !== undefined) {
      await this.prisma.tenant.update({ where: { id: tenant.id }, data: { completedJobsEmail: dto.completedJobsEmail?.trim() || null } });
    }
    if (dto.timezone !== undefined) {
      const zone = dto.timezone.trim();
      if (!isValidTimeZone(zone)) throw new BadRequestException(`Fuseau horaire inconnu : ${zone}`);
      await this.prisma.tenant.update({ where: { id: tenant.id }, data: { timezone: zone } });
    }
    return this.payload(tenant.id);
  }

  @Get('departure-points')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Points de départ prédéfinis (kilométrage, B49.2)' })
  listPoints(@CurrentTenant() tenant: TenantContext) {
    return this.prisma.departurePoint.findMany({ where: { tenantId: tenant.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: POINT_SELECT });
  }

  @Post('departure-points')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[Admin] Ajouter un point de départ' })
  async addPoint(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateDeparturePointDto) {
    const count = await this.prisma.departurePoint.count({ where: { tenantId: tenant.id } });
    return this.prisma.departurePoint.create({
      data: { tenantId: tenant.id, label: dto.label.trim(), address: dto.address.trim(), lat: dto.lat, lng: dto.lng, sortOrder: count },
      select: POINT_SELECT,
    });
  }

  @Delete('departure-points/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Admin] Retirer un point de départ' })
  async removePoint(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const found = await this.prisma.departurePoint.findFirst({ where: { id, tenantId: tenant.id }, select: { id: true } });
    if (!found) throw new NotFoundException('Point de départ introuvable');
    await this.prisma.departurePoint.delete({ where: { id } });
  }
}
