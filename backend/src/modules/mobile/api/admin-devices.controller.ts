import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { DevicesService, type DeviceOwner } from '../application/devices/devices.service';

/**
 * Admin view of a user's mobile devices (ADR-015 « à décider à la première
 * demande ») : list them and revoke one, e.g. a phone lost or a technician
 * who left. Tenant scoping comes from the admin's own tenant.
 */
@ApiTags('Mobile')
@ApiBearerAuth('access-token')
@Controller('mobile/users/:userId/devices')
export class AdminDevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "[Admin] Appareils mobiles d'un utilisateur" })
  list(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() admin: DeviceOwner) {
    return this.devices.listFor({ id: userId, tenantId: admin.tenantId });
  }

  @Delete(':installationId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "[Admin] Révoquer un appareil d'un utilisateur (sessions mobiles coupées)" })
  async revoke(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('installationId', ParseUUIDPipe) installationId: string,
    @CurrentUser() admin: DeviceOwner,
  ) {
    await this.devices.revoke({ id: userId, tenantId: admin.tenantId }, installationId.toLowerCase(), 'admin');
  }
}
