import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { MinioHealthIndicator } from './indicators/minio.health';

/**
 * HealthModule — expose les endpoints /api/health (léger) et
 * /api/health/detailed (DB + MinIO + mémoire + disque). Sans JWT.
 *
 * Note : les indicators DB/MinIO sont DANS ce module pour respecter
 * ADR-001 (pas d'import cross-module vers attachments ou prisma's
 * service interne).
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, MinioHealthIndicator],
})
export class HealthModule {}
