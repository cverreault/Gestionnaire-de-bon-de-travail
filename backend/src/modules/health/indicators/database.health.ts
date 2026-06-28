import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Vérifie que la connexion PostgreSQL est vivante en exécutant
 * `SELECT 1`. Mesure aussi la latence aller-retour.
 */
@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async check(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;
      return this.getStatus(key, true, { latencyMs });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new HealthCheckError(
        'Database ping failed',
        this.getStatus(key, false, { error: message }),
      );
    }
  }
}
