import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Monthly counter reset for per-month quotas (B6.6).
 *
 * Today the only "per month" counter is `current_work_orders_this_month`.
 * Adding a new per-month quota = list it in `MONTHLY_COUNTERS`.
 *
 * Cron: 1st day of each month at 00:05 UTC. The 5-minute offset
 * avoids collision with other midnight maintenance jobs the
 * scheduler might run.
 */

const MONTHLY_COUNTERS = ['current_work_orders_this_month'] as const;

@Injectable()
export class QuotaResetService {
  private readonly logger = new Logger(QuotaResetService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('5 0 1 * *', { name: 'tenant-quota-monthly-reset' })
  async monthlyReset(): Promise<void> {
    await this.runOnce();
  }

  /** Extracted for unit testing — flips every per-month counter to 0. */
  async runOnce(): Promise<number> {
    const setClause = MONTHLY_COUNTERS.map((c) => `"${c}" = 0`).join(', ');
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE tenants SET ${setClause}, work_orders_reset_at = NOW()`,
    );
    this.logger.log(`📅 Monthly quota reset: ${result} tenant rows updated`);
    return result;
  }
}
