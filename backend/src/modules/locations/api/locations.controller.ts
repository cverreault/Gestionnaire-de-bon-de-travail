import {
  Param,
  ParseUUIDPipe,
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
import { LocationBatchDto } from './dto/location-batch.dto';
import { Idempotent } from '../../../common/decorators/idempotent.decorator';

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

  @Post('me/locations/batch')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.TECHNICIAN)
  @Idempotent() // B37.5 — a replayed batch answers the stored result
  // ADR-017 §1 : 12 batches per minute per user (≤ 100 fixes each).
  @Throttle(
    process.env.THROTTLER_DISABLE === '1'
      ? { short: { ttl: 1000, limit: 1_000_000 } }
      : { short: { ttl: 60000, limit: 12 } },
  )
  @ApiOperation({
    summary: 'Upload buffered GPS fixes from the mobile app (B37.7)',
    description:
      'Up to 100 fixes with client timestamps. Consent (preferences.gps.enabled) is re-checked ; ' +
      'fixes > 2 min in the future or older than 7 days are rejected per index ; duplicates are skipped.',
  })
  recordBatch(@CurrentUser() user: JwtUser, @Body() dto: LocationBatchDto) {
    return this.locations.recordBatch(user.id, dto.fixes);
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

  @Get('dispatcher/technicians/:id/position')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({
    summary: 'B57 — où est ce technicien ? Dernière position, âge et adresse la plus proche',
  })
  technicianPosition(@Param('id', ParseUUIDPipe) id: string) {
    return this.locations.technicianPosition(id);
  }

  @Post('dispatcher/technicians/:id/locate')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @HttpCode(HttpStatus.OK)
  @Throttle(
    process.env.THROTTLER_DISABLE === '1'
      ? { short: { ttl: 1000, limit: 1_000_000 } }
      : { short: { ttl: 60000, limit: 10 } },
  )
  @ApiOperation({
    summary: 'B57 — demande une position fraîche au téléphone du technicien (push)',
    description: "L'app répond par un envoi de position ; rappeler GET …/position quelques secondes plus tard.",
  })
  requestLocate(@Param('id', ParseUUIDPipe) id: string) {
    return this.locations.requestLocate(id);
  }
}
