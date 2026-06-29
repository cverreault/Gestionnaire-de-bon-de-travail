import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LocationsService } from './application/locations.service';
import { LocationRetentionService } from './application/location-retention.service';
import { LocationsController } from './api/locations.controller';

/**
 * B5 — Technician live GPS positions.
 *
 * - POST /me/location  (TECHNICIAN, opt-in via preferences.gps.enabled)
 * - GET /dispatcher/technicians/positions  (ADMIN, DISPATCHER)
 *
 * The retention sweep (B5.5) lives here too — keeps the data lifecycle
 * in one place. No domain events emitted in v1; the dispatcher pulls.
 */
@Module({
  imports: [PrismaModule],
  controllers: [LocationsController],
  providers: [LocationsService, LocationRetentionService],
  exports: [LocationsService],
})
export class LocationsModule {}
