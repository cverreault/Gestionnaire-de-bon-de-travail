import { Module } from '@nestjs/common';
import { DispatchMapController } from './api/dispatch-map.controller';
import { DispatchMapService } from './application/dispatch-map.service';
import { GeocodingService } from './application/geocoding.service';

@Module({
  controllers: [DispatchMapController],
  providers: [DispatchMapService, GeocodingService],
})
export class DispatchMapModule {}
