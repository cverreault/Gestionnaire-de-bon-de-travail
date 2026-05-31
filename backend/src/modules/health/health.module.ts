import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * HealthModule — expose GET /api/health sans authentification.
 * À importer dans AppModule.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
