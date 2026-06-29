import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  QuotaExceededException,
  QuotaType,
} from '../../../common/contracts/quota.contract';

/**
 * QuotaService (B6.6).
 *
 * Tenant ceilings live on the Tenant row as a (max_X, current_X) pair.
 * Every business module calls `checkAndConsume(quota, tenantId, n)`
 * before creating a resource — the increment + the ceiling check
 * happen in a single SQL statement so two concurrent requests can't
 * both pass a "you have 1 slot left" check.
 *
 * SQL pattern :
 *   UPDATE tenants
 *   SET current_X = current_X + n
 *   WHERE id = $1 AND current_X + n <= max_X
 *   RETURNING id
 *
 * Zero rows back ⇒ quota exceeded.
 *
 * `release()` decrements the counter — call it when a resource is
 * deleted so a tenant doesn't slowly run out of slots over time.
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomic check + consume. Throws QuotaExceededException (HTTP 403)
   * when the resulting `current_X` would exceed `max_X`. Always
   * increments by `amount` (defaults to 1).
   */
  async checkAndConsume(
    quota: QuotaType,
    tenantId: string,
    amount = 1,
  ): Promise<void> {
    const { currentCol, maxCol } = columnsFor(quota);

    // STORAGE_BYTES — max is stored in MB, current in bytes. Compare
    // in bytes by multiplying the ceiling on the fly.
    const ceilingExpr =
      quota === QuotaType.STORAGE_BYTES
        ? `"${maxCol}" * 1024 * 1024`
        : `"${maxCol}"`;

    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE tenants
         SET "${currentCol}" = "${currentCol}" + $1
         WHERE id = $2 AND "${currentCol}" + $1 <= ${ceilingExpr}
       RETURNING id`,
      amount,
      tenantId,
    );

    if (rows.length === 0) {
      this.logger.warn(
        `Quota ${quota} dépassé pour tenant=${tenantId} (amount=${amount})`,
      );
      throw new ForbiddenException(
        new QuotaExceededException(quota, tenantId).message,
      );
    }
  }

  /**
   * Decrements a counter — call when a resource is deleted. Never
   * goes below 0 (defensive — a counter that drifts negative breaks
   * future checkAndConsume calls).
   */
  async release(
    quota: QuotaType,
    tenantId: string,
    amount = 1,
  ): Promise<void> {
    const { currentCol } = columnsFor(quota);

    await this.prisma.$executeRawUnsafe(
      `UPDATE tenants
         SET "${currentCol}" = GREATEST(0, "${currentCol}" - $1)
         WHERE id = $2`,
      amount,
      tenantId,
    );
  }
}

/**
 * Maps a QuotaType to its DB column names. Kept private so the SQL
 * identifiers stay confined to this file and can't be invoked by
 * callers with an arbitrary string.
 */
function columnsFor(quota: QuotaType): {
  currentCol: string;
  maxCol: string;
} {
  switch (quota) {
    case QuotaType.USERS:
      return { currentCol: 'current_users', maxCol: 'max_users' };
    case QuotaType.WORK_ORDERS_PER_MONTH:
      return {
        currentCol: 'current_work_orders_this_month',
        maxCol: 'max_work_orders_per_month',
      };
    case QuotaType.STORAGE_BYTES:
      // max_storage_mb stored as MB on the row but we compare bytes —
      // the value is multiplied by 1024*1024 below.
      return {
        currentCol: 'current_storage_bytes',
        maxCol: 'max_storage_mb',
      };
    case QuotaType.CLIENTS:
      return { currentCol: 'current_clients', maxCol: 'max_clients' };
    default: {
      const exhaustive: never = quota;
      throw new Error(`Unhandled quota type: ${exhaustive}`);
    }
  }
}
