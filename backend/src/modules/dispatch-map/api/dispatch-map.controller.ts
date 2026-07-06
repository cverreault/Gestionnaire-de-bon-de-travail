import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsArray, IsString } from 'class-validator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { DispatchMapService } from '../application/dispatch-map.service';
import { GeocodingService } from '../application/geocoding.service';

class OptimizeRouteDto {
  @IsString()
  technicianId!: string;

  @IsArray()
  @IsString({ each: true })
  workOrderIds!: string[];
}

@ApiTags('Dispatch map')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN, Role.DISPATCHER)
@Controller('dispatch-map')
export class DispatchMapController {
  constructor(
    private readonly service: DispatchMapService,
    private readonly geocoding: GeocodingService,
  ) {}

  @Get('snapshot')
  @ApiOperation({
    summary:
      'Position des techniciens + BT actifs. Filtres optionnels : ' +
      '?from=ISO&to=ISO (sur scheduledDate) et &includeUnscheduled=true.',
  })
  async snapshot(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('includeUnscheduled') includeUnscheduled?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const valid =
      fromDate && toDate && !Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime());
    return this.service.snapshot(
      valid
        ? {
            from: fromDate,
            to: toDate,
            includeUnscheduled: includeUnscheduled === 'true',
          }
        : undefined,
    );
  }

  @Post('optimize-route')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ordonne une liste de BT pour minimiser la distance parcourue',
  })
  async optimize(@Body() dto: OptimizeRouteDto) {
    return this.service.optimizeRoute(dto.technicianId, dto.workOrderIds);
  }

  @Post('geocode-missing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Géocode (Nominatim/OSM) jusqu\'à 25 adresses clients sans coordonnées. ' +
      '~1 s par adresse (politique de rate-limit OSM).',
  })
  async geocodeMissing() {
    return this.geocoding.geocodeMissing();
  }
}
