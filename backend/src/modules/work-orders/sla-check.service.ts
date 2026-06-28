import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  WO_EVENT_NAMES,
  workOrderSlaBreached,
} from './domain/events/work-order-events';

/**
 * Nightly cron that detects SLA breaches on active work orders (B4.b).
 *
 * Scans every 15 minutes the rows where:
 *   - sla_target_at is in the past
 *   - sla_breached_at is still null
 *   - status is not a COMPLETED_* terminal state (a BT that was
 *     completed past the deadline is "late completion" but not an
 *     "active breach", and we don't want to notify after the fact)
 *
 * For each match: set slaBreachedAt = now, emit a domain event. The
 * audit module persists the event automatically via wildcard; the
 * notifications listener (B4.c) routes it to the right user.
 *
 * Frequency: 15 min keeps the latency tight for most teams without
 * burying the DB. Adjust via env if needed later.
 */

const BATCH_LIMIT = 100;

@Injectable()
export class SlaCheckService {
  private readonly logger = new Logger(SlaCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron('*/15 * * * *', { name: 'sla-check' })
  async sweep(): Promise<void> {
    await this.runOnce();
  }

  /**
   * Extracted so unit tests can drive the algorithm without faking
   * the @Cron schedule. Returns the number of rows processed so
   * callers can assert behaviour.
   */
  async runOnce(): Promise<number> {
    const now = new Date();

    const breached = await this.prisma.workOrder.findMany({
      where: {
        slaTargetAt: { lt: now },
        slaBreachedAt: null,
        status: {
          notIn: [
            WorkOrderStatus.COMPLETED_POSITIVE,
            WorkOrderStatus.COMPLETED_NEGATIVE,
          ],
        },
      },
      select: {
        id: true,
        slaTargetAt: true,
        assignedToId: true,
        taskTypeId: true,
      },
      take: BATCH_LIMIT,
      orderBy: { slaTargetAt: 'asc' },
    });

    if (breached.length === 0) return 0;

    // Resolve slaHours per task type in batch so we can include it in
    // the event payload without N+1.
    const typeIds = Array.from(
      new Set(breached.map((b) => b.taskTypeId).filter((id): id is string => !!id)),
    );
    const types = typeIds.length
      ? await this.prisma.taskType.findMany({
          where: { id: { in: typeIds } },
          select: { id: true, slaHours: true },
        })
      : [];
    const slaHoursByType = new Map(types.map((t) => [t.id, t.slaHours]));

    let processed = 0;
    for (const wo of breached) {
      try {
        await this.prisma.workOrder.update({
          where: { id: wo.id },
          data: { slaBreachedAt: now },
        });

        this.eventEmitter.emit(
          WO_EVENT_NAMES.SLA_BREACHED,
          workOrderSlaBreached(wo.id, {
            slaTargetAt: wo.slaTargetAt!.toISOString(),
            detectedAt: now.toISOString(),
            slaHours: wo.taskTypeId ? slaHoursByType.get(wo.taskTypeId) ?? null : null,
            assignedToId: wo.assignedToId,
          }),
        );
        processed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to mark BT ${wo.id} as SLA-breached: ${message}`);
      }
    }

    this.logger.log(`⏰ SLA check: marked ${processed} BT(s) as breached`);
    return processed;
  }
}
