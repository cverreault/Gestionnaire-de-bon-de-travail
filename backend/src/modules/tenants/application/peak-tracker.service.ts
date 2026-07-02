import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { QuotaType } from '../../../common/contracts/quota.contract';

/**
 * Monthly peak tracker (B7.12).
 *
 * Maintains the `tenant_monthly_peaks` high-water-mark table so per-seat
 * pricing bills the month's peak count, not the current one. The
 * bookkeeping is a single UPSERT with `GREATEST(existing, incoming)` on
 * the peak column — atomic at the DB level, safe under concurrent
 * increments.
 *
 * Only INCREMENTS trigger a peak update (a release is intentionally NOT
 * recorded — that's the whole reason the peak exists). The peak column
 * to touch is selected from the `QuotaType`; unmapped kinds throw so a
 * mistyped call fails loudly instead of silently no-ping.
 */
@Injectable()
export class PeakTrackerService {
  private readonly logger = new Logger(PeakTrackerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record `newValue` as the peak for the current month if it is higher
   * than the existing peak for that (tenant, month, quota). Called from
   * `QuotaService.checkAndConsume` right after the counter increment
   * succeeds, with the resulting current value.
   */
  async record(
    tenantId: string,
    quota: QuotaType,
    newValue: number,
  ): Promise<void> {
    const col = peakColumnFor(quota);
    const yearMonth = currentYearMonth();

    // Postgres `GREATEST` correctly handles both BIGINT and INT columns,
    // so the same statement fits USERS / CLIENTS / WORK_ORDERS / STORAGE.
    // The `WHERE` guard on the update side means we don't touch the row
    // when the current peak is already higher — no updated_at churn.
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO tenant_monthly_peaks (
           id, tenant_id, year_month, "${col}", updated_at
         ) VALUES (gen_random_uuid(), $1, $2, $3, NOW())
         ON CONFLICT (tenant_id, year_month)
         DO UPDATE SET
           "${col}" = GREATEST(tenant_monthly_peaks."${col}", EXCLUDED."${col}"),
           updated_at = CASE
             WHEN EXCLUDED."${col}" > tenant_monthly_peaks."${col}" THEN NOW()
             ELSE tenant_monthly_peaks.updated_at
           END`,
        tenantId,
        yearMonth,
        newValue,
      );
    } catch (err) {
      // Peak tracking is bookkeeping — a failure here must NOT crash the
      // caller (the primary counter increment already committed).
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Peak record failed tenant=${tenantId} quota=${quota} value=${newValue}: ${message}`,
      );
    }
  }

  /**
   * Read the current month's peaks for a tenant. Returns zeros for a
   * tenant that has no peak row yet (e.g. a brand-new tenant created
   * this month before the first counter increment ran).
   */
  async currentMonthPeaks(tenantId: string): Promise<MonthlyPeakRow> {
    const yearMonth = currentYearMonth();
    return this.byMonth(tenantId, yearMonth);
  }

  async byMonth(tenantId: string, yearMonth: string): Promise<MonthlyPeakRow> {
    type Row = {
      max_users: number;
      max_clients: number;
      max_work_orders_this_month: number;
      max_storage_bytes: bigint;
    };
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT max_users, max_clients, max_work_orders_this_month, max_storage_bytes
       FROM tenant_monthly_peaks
       WHERE tenant_id = $1 AND year_month = $2`,
      tenantId,
      yearMonth,
    );
    const r = rows[0];
    return {
      yearMonth,
      maxUsers: r?.max_users ?? 0,
      maxClients: r?.max_clients ?? 0,
      maxWorkOrdersThisMonth: r?.max_work_orders_this_month ?? 0,
      maxStorageBytes: Number(r?.max_storage_bytes ?? 0n),
    };
  }

  /**
   * Last `months` months of peaks for a tenant, most-recent first.
   * Empty months (no counter activity + no signup) are skipped rather
   * than filled with zeros — a table of "no rows found" would be misleading.
   */
  async history(tenantId: string, months = 12): Promise<MonthlyPeakRow[]> {
    type Row = {
      year_month: string;
      max_users: number;
      max_clients: number;
      max_work_orders_this_month: number;
      max_storage_bytes: bigint;
    };
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT year_month, max_users, max_clients, max_work_orders_this_month, max_storage_bytes
       FROM tenant_monthly_peaks
       WHERE tenant_id = $1
       ORDER BY year_month DESC
       LIMIT $2`,
      tenantId,
      months,
    );
    return rows.map((r) => ({
      yearMonth: r.year_month,
      maxUsers: r.max_users,
      maxClients: r.max_clients,
      maxWorkOrdersThisMonth: r.max_work_orders_this_month,
      maxStorageBytes: Number(r.max_storage_bytes),
    }));
  }
}

export interface MonthlyPeakRow {
  yearMonth: string;
  maxUsers: number;
  maxClients: number;
  maxWorkOrdersThisMonth: number;
  maxStorageBytes: number;
}

function peakColumnFor(quota: QuotaType): string {
  switch (quota) {
    case QuotaType.USERS:
      return 'max_users';
    case QuotaType.CLIENTS:
      return 'max_clients';
    case QuotaType.WORK_ORDERS_PER_MONTH:
      return 'max_work_orders_this_month';
    case QuotaType.STORAGE_BYTES:
      return 'max_storage_bytes';
    default: {
      const _exhaustive: never = quota;
      throw new Error(`Unhandled quota type for peak tracking: ${_exhaustive}`);
    }
  }
}

/** UTC year-month key, matches the seed migration format. */
function currentYearMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
