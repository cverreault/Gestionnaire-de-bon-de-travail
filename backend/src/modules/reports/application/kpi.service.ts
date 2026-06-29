import { Injectable, Logger } from '@nestjs/common';
import { WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface DateRange {
  from: Date;
  to: Date;
}

export interface ResolutionTimeRow {
  taskTypeId: string | null;
  taskTypeName: string | null;
  completedCount: number;
  /** Mean resolution time in hours across completed BTs in the range. */
  avgResolutionHours: number;
  /** Median resolution time in hours — robust to outliers. */
  medianResolutionHours: number;
}

export interface CompletionOutcomeRow {
  taskTypeId: string | null;
  taskTypeName: string | null;
  positive: number;
  negative: number;
  /** positive / (positive + negative) — 0..1, or null if no completions. */
  successRate: number | null;
}

export interface SlaSummaryRow {
  taskTypeId: string | null;
  taskTypeName: string | null;
  /** BTs tracked under an SLA in the range (slaTargetAt not null). */
  tracked: number;
  breached: number;
  /** breached / tracked — 0..1, or null if no tracked BTs. */
  breachRate: number | null;
}

export interface ThroughputBucket {
  /** ISO date YYYY-MM-DD (UTC) of the bucket start. */
  date: string;
  created: number;
  completed: number;
}

const COMPLETED_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.COMPLETED_POSITIVE,
  WorkOrderStatus.COMPLETED_NEGATIVE,
];

/**
 * Advanced KPI queries that complement the dashboard module.
 *
 * The dashboard exposes status snapshots and per-user workload; this
 * service answers operational analytics questions: how fast are we
 * resolving by type, what's our success rate, how often are we
 * breaching SLAs, what's the daily throughput trend?
 *
 * Date-range bounded — no unbounded scans — and grouped server-side
 * to avoid shipping raw rows to the client.
 */
@Injectable()
export class KpiService {
  private readonly logger = new Logger(KpiService.name);

  constructor(private readonly prisma: PrismaService) {}

  defaultRange(): DateRange {
    const to = new Date();
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 30);
    from.setUTCHours(0, 0, 0, 0);
    return { from, to };
  }

  parseRange(from?: string, to?: string): DateRange {
    const def = this.defaultRange();
    return {
      from: from ? new Date(from) : def.from,
      to: to ? new Date(to) : def.to,
    };
  }

  /**
   * Average + median resolution time per task type, computed as
   * (actualEndTime || updatedAt) - createdAt for BTs that reached a
   * terminal status within the range.
   *
   * Uses raw SQL because Prisma doesn't expose percentile_cont and
   * AVG over a computed interval is awkward through the JS client.
   */
  async resolutionTimeByTaskType(range: DateRange): Promise<ResolutionTimeRow[]> {
    type Row = {
      task_type_id: string | null;
      task_type_name: string | null;
      completed_count: bigint;
      avg_hours: number | null;
      median_hours: number | null;
    };

    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT
        wo.task_type_id,
        tt.name AS task_type_name,
        COUNT(*)::bigint AS completed_count,
        AVG(EXTRACT(EPOCH FROM (COALESCE(wo.actual_end_time, wo.updated_at) - wo.created_at)) / 3600.0)::float8 AS avg_hours,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (COALESCE(wo.actual_end_time, wo.updated_at) - wo.created_at)) / 3600.0
        )::float8 AS median_hours
      FROM work_orders wo
      LEFT JOIN task_types tt ON tt.id = wo.task_type_id
      WHERE wo.status IN ('COMPLETED_POSITIVE', 'COMPLETED_NEGATIVE')
        AND wo.updated_at >= ${range.from}
        AND wo.updated_at <= ${range.to}
      GROUP BY wo.task_type_id, tt.name
      ORDER BY completed_count DESC
    `;

    return rows.map((r) => ({
      taskTypeId: r.task_type_id,
      taskTypeName: r.task_type_name,
      completedCount: Number(r.completed_count),
      avgResolutionHours: r.avg_hours ?? 0,
      medianResolutionHours: r.median_hours ?? 0,
    }));
  }

  /** Positive vs negative completion counts per task type. */
  async completionOutcomeByTaskType(range: DateRange): Promise<CompletionOutcomeRow[]> {
    const grouped = await this.prisma.workOrder.groupBy({
      by: ['taskTypeId', 'status'],
      where: {
        status: { in: COMPLETED_STATUSES },
        updatedAt: { gte: range.from, lte: range.to },
      },
      _count: { _all: true },
    });

    const byType = new Map<string | null, { positive: number; negative: number }>();
    for (const row of grouped) {
      const bucket = byType.get(row.taskTypeId) ?? { positive: 0, negative: 0 };
      if (row.status === WorkOrderStatus.COMPLETED_POSITIVE) {
        bucket.positive += row._count._all;
      } else {
        bucket.negative += row._count._all;
      }
      byType.set(row.taskTypeId, bucket);
    }

    const typeIds = Array.from(byType.keys()).filter((id): id is string => id !== null);
    const types = typeIds.length
      ? await this.prisma.taskType.findMany({
          where: { id: { in: typeIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(types.map((t) => [t.id, t.name]));

    const result: CompletionOutcomeRow[] = [];
    for (const [taskTypeId, counts] of byType.entries()) {
      const total = counts.positive + counts.negative;
      result.push({
        taskTypeId,
        taskTypeName: taskTypeId ? nameById.get(taskTypeId) ?? null : null,
        positive: counts.positive,
        negative: counts.negative,
        successRate: total > 0 ? counts.positive / total : null,
      });
    }

    return result.sort(
      (a, b) => b.positive + b.negative - (a.positive + a.negative),
    );
  }

  /** SLA breach rate per task type for BTs whose slaTargetAt fell in the range. */
  async slaSummaryByTaskType(range: DateRange): Promise<SlaSummaryRow[]> {
    const grouped = await this.prisma.workOrder.groupBy({
      by: ['taskTypeId'],
      where: {
        slaTargetAt: { gte: range.from, lte: range.to },
      },
      _count: { _all: true },
    });

    const breached = await this.prisma.workOrder.groupBy({
      by: ['taskTypeId'],
      where: {
        slaTargetAt: { gte: range.from, lte: range.to },
        slaBreachedAt: { not: null },
      },
      _count: { _all: true },
    });

    const breachByType = new Map<string | null, number>();
    for (const r of breached) breachByType.set(r.taskTypeId, r._count._all);

    const typeIds = grouped
      .map((r) => r.taskTypeId)
      .filter((id): id is string => id !== null);
    const types = typeIds.length
      ? await this.prisma.taskType.findMany({
          where: { id: { in: typeIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(types.map((t) => [t.id, t.name]));

    return grouped
      .map((r) => {
        const tracked = r._count._all;
        const breachedCount = breachByType.get(r.taskTypeId) ?? 0;
        return {
          taskTypeId: r.taskTypeId,
          taskTypeName: r.taskTypeId ? nameById.get(r.taskTypeId) ?? null : null,
          tracked,
          breached: breachedCount,
          breachRate: tracked > 0 ? breachedCount / tracked : null,
        };
      })
      .sort((a, b) => b.tracked - a.tracked);
  }

  /**
   * Daily counts of BTs created and completed in the range.
   * Buckets are aligned on UTC days.
   */
  async throughput(range: DateRange): Promise<ThroughputBucket[]> {
    type Row = { day: Date; created: bigint; completed: bigint };

    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', ${range.from}::timestamp),
          date_trunc('day', ${range.to}::timestamp),
          '1 day'::interval
        ) AS day
      ),
      created AS (
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::bigint AS n
        FROM work_orders
        WHERE created_at >= ${range.from} AND created_at <= ${range.to}
        GROUP BY 1
      ),
      completed AS (
        SELECT date_trunc('day', updated_at) AS day, COUNT(*)::bigint AS n
        FROM work_orders
        WHERE status IN ('COMPLETED_POSITIVE', 'COMPLETED_NEGATIVE')
          AND updated_at >= ${range.from} AND updated_at <= ${range.to}
        GROUP BY 1
      )
      SELECT
        d.day,
        COALESCE(c.n, 0)::bigint AS created,
        COALESCE(co.n, 0)::bigint AS completed
      FROM days d
      LEFT JOIN created c ON c.day = d.day
      LEFT JOIN completed co ON co.day = d.day
      ORDER BY d.day ASC
    `;

    return rows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      created: Number(r.created),
      completed: Number(r.completed),
    }));
  }
}
