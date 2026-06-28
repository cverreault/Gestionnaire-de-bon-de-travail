import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Nightly purge of stale audit_logs entries.
 *
 * Loi 25 / PIPEDA encourage minimising the retention of personal data.
 * The audit_logs table records actorUserId on every business event —
 * keeping it forever is both costly and a compliance liability.
 *
 * Default window: 365 days. Overridable per deployment via
 * `AUDIT_RETENTION_DAYS=N` (clamped to [30, 3650] = 1 month → 10 years).
 *
 * 03:30 local time runs minutes after the refresh-token cleanup so we
 * don't stack two heavy DELETEs on the same query plan window.
 */
const DEFAULT_RETENTION_DAYS = 365;
const MIN_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 3650;

@Injectable()
export class AuditCleanupService {
  private readonly logger = new Logger(AuditCleanupService.name);
  private readonly retentionDays: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const raw = config.get<string>('AUDIT_RETENTION_DAYS');
    const parsed = raw ? parseInt(raw, 10) : NaN;
    this.retentionDays = Number.isFinite(parsed)
      ? Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, parsed))
      : DEFAULT_RETENTION_DAYS;
  }

  @Cron('30 3 * * *', { name: 'audit-cleanup' })
  async sweep(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
    try {
      const result = await this.prisma.auditLog.deleteMany({
        where: { occurredAt: { lt: cutoff } },
      });
      this.logger.log(
        `🧹 Audit cleanup: purged ${result.count} row(s) older than ${this.retentionDays} days`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Audit cleanup failed: ${message}`);
    }
  }
}

// Tests need to import these constants — keeping them exported lets the
// spec assert the clamp boundaries without hardcoding numbers in two places.
export const AUDIT_CLEANUP_CONSTANTS = {
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
} as const;
