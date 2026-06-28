import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Nightly purge of dead refresh tokens.
 *
 * The rotation chain shipped in C6 leaves three classes of rows behind:
 *   - revoked (revokedAt set) — kept briefly so an attacker re-presenting
 *     a stolen token still trips the replay defense
 *   - expired (expiresAt < now) — they cannot authenticate anyway
 *   - both
 *
 * Holding onto them forever bloats the index on `token_hash` and gives
 * attackers more material to mine if the DB ever leaks. The cron sweeps
 * any row where revokedAt OR expiresAt is older than KEEP_DAYS (default
 * 30). The replay-protection window stays generous — a stolen token is
 * detected long before 30 days pass.
 *
 * 03:00 local time runs minimise overlap with peak traffic. The cron is
 * a single SQL DELETE — no transaction, no row lock contention beyond
 * what Prisma already issues.
 */
const KEEP_DAYS = 30;

@Injectable()
export class RefreshTokenCleanupService {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run nightly at 03:00. `EVERY_DAY_AT_3AM` is provided by
   * @nestjs/schedule for convenience.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'refresh-token-cleanup' })
  async sweep(): Promise<void> {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { revokedAt: { lt: cutoff } },
            { expiresAt: { lt: cutoff } },
          ],
        },
      });
      this.logger.log(
        `🧹 Refresh token cleanup: purged ${result.count} row(s) older than ${KEEP_DAYS} days`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Don't throw — a failed sweep should not crash the scheduler.
      // We'll see it again tomorrow with luck.
      this.logger.error(`Refresh token cleanup failed: ${message}`);
    }
  }
}
