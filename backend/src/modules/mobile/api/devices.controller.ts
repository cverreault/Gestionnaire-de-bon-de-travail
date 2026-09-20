import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { DEVICE_ID_HEADER, extractDeviceId } from '../../../common/contracts/device-context.contract';
import { DevicesService, type DeviceOwner } from '../application/devices/devices.service';
import { HeartbeatDto, RegisterDeviceDto } from './dto/register-device.dto';
import { DeviceReportDto } from './dto/device-report.dto';

/**
 * Self-service device registry of the mobile app (B37.3, ADR-015).
 * Every route is scoped to the caller: an installation that is not theirs
 * answers 404. Writes require the `X-Device-Id` header to match the path,
 * so a token can only register the phone it is actually running on.
 */
@ApiTags('Mobile')
@ApiBearerAuth('access-token')
@Controller('me/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @ApiOperation({ summary: 'Mes appareils mobiles' })
  list(@CurrentUser() user: DeviceOwner) {
    return this.devices.listMine(user);
  }

  @Put(':installationId')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Enregistrer ou mettre à jour cet appareil' })
  register(
    @Param('installationId', ParseUUIDPipe) installationId: string,
    @Headers(DEVICE_ID_HEADER) header: string | undefined,
    @Body() dto: RegisterDeviceDto,
    @CurrentUser() user: DeviceOwner,
  ) {
    assertHeaderMatches(header, installationId);
    return this.devices.register(user, installationId.toLowerCase(), dto);
  }

  @Post(':installationId/heartbeat')
  @Roles(Role.TECHNICIAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Signal de vie ; renvoie la porte de version' })
  heartbeat(
    @Param('installationId', ParseUUIDPipe) installationId: string,
    @Headers(DEVICE_ID_HEADER) header: string | undefined,
    @Body() dto: HeartbeatDto,
    @CurrentUser() user: DeviceOwner,
  ) {
    assertHeaderMatches(header, installationId);
    return this.devices.heartbeat(user, installationId.toLowerCase(), dto);
  }

  @Post(':installationId/report')
  @Roles(Role.TECHNICIAN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Rapport de diagnostic de l'app (journalisé côté serveur)" })
  report(
    @Param('installationId', ParseUUIDPipe) installationId: string,
    @Headers(DEVICE_ID_HEADER) header: string | undefined,
    @Body() dto: DeviceReportDto,
    @CurrentUser() user: DeviceOwner,
  ) {
    assertHeaderMatches(header, installationId);
    return this.devices.report(user, installationId.toLowerCase(), dto);
  }

  @Delete(':installationId')
  @Roles(Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Révoquer un appareil (sessions mobiles coupées)' })
  async revoke(@Param('installationId', ParseUUIDPipe) installationId: string, @CurrentUser() user: DeviceOwner) {
    await this.devices.revoke(user, installationId.toLowerCase(), 'user');
  }
}

function assertHeaderMatches(header: string | undefined, installationId: string): void {
  const fromHeader = extractDeviceId(header);
  if (!fromHeader || fromHeader !== installationId.toLowerCase()) {
    throw new BadRequestException(`L'en-tête ${DEVICE_ID_HEADER} doit correspondre à l'appareil visé`);
  }
}
