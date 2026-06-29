import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Nightly purge of technician_locations older than 7 days (B5.5).
 *
 * Compliance posture (Loi 25 / PIPEDA):
 *   - Only the minimum data required for the live-dispatch use case
 *     is kept. The 7-day window covers a "did the tech actually
 *     reach the site for this BT?" audit retroactively without
 *     accumulating a long-term movement profile.
 *   - The cron is unconditional — it runs even when the cluster
 *     boots, and even when no tech has opted in. Defence in depth:
 *     if the gating ever regresses and stale rows are inserted,
 *     they're still pruned within a day.
 *
 * Frequency: daily at 03:30 UTC (between the other maintenance
 * crons — refresh-token cleanup at 03:00, audit retention at 03:30
 * — pick a different minute to avoid overlap; we use :15 for this
 * one). The DELETE is index-driven (idx_technician_locations_recorded_at),
 * so even a months-long backlog clears in milliseconds.
 */

const RETENTION_DAYS = 7;

@Injectable()
export class LocationRetentionService {
  private readonly logger = new Logger(LocationRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('15 3 * * *', { name: 'location-retention-sweep' })
  async sweep(): Promise<void> {
    await this.runOnce();
  }

  /**
   * Extracted so unit tests can drive the algorithm without faking
   * @Cron. Returns the number of deleted rows so callers can assert.
   */
  async runOnce(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const result = await this.prisma.technicianLocation.deleteMany({
      where: { recordedAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      this.logger.log(
        `🗑️  Location retention: pruned ${result.count} rows older than ${cutoff.toISOString()}`,
      );
    }
    return result.count;
  }
}
