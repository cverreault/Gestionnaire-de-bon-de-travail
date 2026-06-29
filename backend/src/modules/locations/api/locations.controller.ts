import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { LocationsService } from '../application/locations.service';
import { RecordLocationDto } from './dto/record-location.dto';

interface JwtUser {
  id: string;
  role: Role;
}

@ApiTags('Locations')
@ApiBearerAuth('access-token')
@Controller()
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Post('me/location')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.TECHNICIAN)
  // Capped at 60/min — a tech sending a position every second isn't a
  // realistic use case (the front-end polls every 30s). 60 leaves room
  // for retries on flaky links without inviting log/storage abuse.
  @Throttle(
    process.env.THROTTLER_DISABLE === '1'
      ? { short: { ttl: 1000, limit: 1_000_000 } }
      : { short: { ttl: 60000, limit: 60 } },
  )
  @ApiOperation({
    summary: 'Record the calling technician\'s current GPS position',
    description:
      'Server re-checks preferences.gps.enabled even when called — ' +
      'a stale tab or tampered client can\'t keep posting after opt-out.',
  })
  async record(
    @CurrentUser() user: JwtUser,
    @Body() dto: RecordLocationDto,
  ): Promise<void> {
    await this.locations.recordLocation({
      userId: user.id,
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy ?? null,
    });
  }

  @Get('dispatcher/technicians/positions')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'Latest known position for each opted-in technician',
    description:
      'One row per active technician with at least one recorded ' +
      'position. The map view polls this every few seconds.',
  })
  async latestPositions() {
    const rows = await this.locations.latestPositions();
    return { rows };
  }
}
