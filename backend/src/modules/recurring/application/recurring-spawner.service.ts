import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkOrderType, Role } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkOrdersService } from '../../work-orders/work-orders.service';
import { RequestContextService } from '../../../common/context/request-context.service';
import { advanceNextRunAfterSpawn } from './recurring-work-orders.service';

/**
 * B11 — Cron sweeper that spawns WorkOrders from RecurringWorkOrder rows
 * whose `nextRunAt` has come due.
 *
 * Runs every 5 minutes. Cheap query (indexed on `(is_active, next_run_at)`)
 * so the frequency is essentially free.
 *
 * ─ Concurrency ─
 *   We update `next_run_at` FIRST (advance to the next occurrence) then
 *   create the WO. Two overlapping runs won't dupe: the second one sees
 *   `next_run_at > NOW()` and skips the row.
 *
 * ─ Errors ─
 *   Each row is processed independently; a broken row logs a warning but
 *   doesn't stop the sweep. The next sweep gives it another try only if
 *   `next_run_at` is still due (which it isn't, because we advanced it) —
 *   deliberate: a poisoned row shouldn't infinitely retry. The admin sees
 *   the missing spawn in the UI (spawned_count didn't increment) and
 *   investigates.
 */
@Injectable()
export class RecurringSpawnerService {
  private readonly logger = new Logger(RecurringSpawnerService.name);

  private static readonly SWEEP_BATCH = 50;

  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrders: WorkOrdersService,
    private readonly context: RequestContextService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    if (this.isSweeping) return;
    this.isSweeping = true;
    try {
      await this.runOnce();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Recurring sweep failed: ${message}`);
    } finally {
      this.isSweeping = false;
    }
  }

  async runOnce(): Promise<{ spawned: number }> {
    const now = new Date();

    // Cross-tenant read — raw SQL to skip the tenant-scope middleware.
    // We honour tenant isolation manually when spawning by passing the
    // right tenantId through the RequestContext.
    type Row = {
      id: string;
      tenant_id: string;
      task_type_id: string;
      client_id: string;
      client_address_id: string | null;
      assigned_to_id: string | null;
      work_order_title: string;
      work_order_description: string;
      priority: number;
      frequency: string;
      interval: number;
      by_day_of_week: number[];
      by_day_of_month: number[];
      start_date: Date;
      end_date: Date | null;
      next_run_at: Date;
      last_run_at: Date | null;
      spawned_count: number;
      created_by_user_id: string;
    };
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, tenant_id, task_type_id, client_id, client_address_id,
              assigned_to_id, work_order_title, work_order_description,
              priority, frequency, interval, by_day_of_week, by_day_of_month,
              start_date, end_date, next_run_at, last_run_at, spawned_count,
              created_by_user_id
         FROM recurring_work_orders
        WHERE is_active = true
          AND next_run_at <= $1
          AND (end_date IS NULL OR end_date >= $1)
        ORDER BY next_run_at
        LIMIT $2`,
      now,
      RecurringSpawnerService.SWEEP_BATCH,
    );

    if (rows.length === 0) return { spawned: 0 };

    let spawned = 0;
    for (const row of rows) {
      try {
        await this.spawnOne(row, now);
        spawned++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Recurring row ${row.id} spawn failed: ${message}`,
        );
      }
    }
    return { spawned };
  }

  /**
   * Spawn a single WO from a recurring row.
   *
   * Runs inside the tenant's async-local-storage context so the Prisma
   * tenant-scope middleware picks up the right tenantId — otherwise the
   * WO would be created with the default seed tenant.
   */
  private async spawnOne(
    row: {
      id: string;
      tenant_id: string;
      task_type_id: string;
      client_id: string;
      client_address_id: string | null;
      assigned_to_id: string | null;
      work_order_title: string;
      work_order_description: string;
      priority: number;
      frequency: string;
      interval: number;
      by_day_of_week: number[];
      by_day_of_month: number[];
      start_date: Date;
      end_date: Date | null;
      next_run_at: Date;
      last_run_at: Date | null;
      spawned_count: number;
      created_by_user_id: string;
    },
    now: Date,
  ): Promise<void> {
    const nextAfter = advanceNextRunAfterSpawn(
      {
        id: row.id,
        name: '',
        description: '',
        isActive: true,
        taskTypeId: row.task_type_id,
        clientId: row.client_id,
        clientAddressId: row.client_address_id,
        assignedToId: row.assigned_to_id,
        workOrderTitle: row.work_order_title,
        workOrderDescription: row.work_order_description,
        priority: row.priority,
        frequency: row.frequency,
        interval: row.interval,
        byDayOfWeek: row.by_day_of_week,
        byDayOfMonth: row.by_day_of_month,
        startDate: row.start_date,
        endDate: row.end_date,
        nextRunAt: row.next_run_at,
        lastRunAt: row.last_run_at,
        spawnedCount: row.spawned_count,
        createdByUserId: row.created_by_user_id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      now,
    );

    // 1. Advance next_run_at FIRST — concurrent sweeps can't dupe.
    await this.prisma.$executeRawUnsafe(
      `UPDATE recurring_work_orders
          SET next_run_at = $2,
              last_run_at = $3,
              spawned_count = spawned_count + 1
        WHERE id = $1`,
      row.id,
      nextAfter,
      now,
    );

    // 2. Create the WorkOrder inside the tenant context so tenant-scope
    //    middleware injects the right tenantId.
    const title = this.renderTitle(row.work_order_title, now);
    await this.context.run(
      { tenantId: row.tenant_id, userId: row.created_by_user_id },
      async () => {
        await this.workOrders.create(
          {
            title,
            description: row.work_order_description || undefined,
            type: WorkOrderType.OTHER,
            priority: row.priority,
            taskTypeId: row.task_type_id,
            clientId: row.client_id,
            clientAddressId: row.client_address_id ?? undefined,
            assignedToId: row.assigned_to_id ?? undefined,
          } as never, // Prisma DTO shape — casted so we don't need a `type` field the caller doesn't care about.
          { id: row.created_by_user_id, role: Role.ADMIN },
        );
      },
    );

    this.logger.debug(
      `Spawned recurring ${row.id} → WO for tenant ${row.tenant_id}, next=${nextAfter.toISOString()}`,
    );
  }

  /**
   * Simple `{{date}}` → « 2026-07-15 » substitution in the title template.
   * Kept minimal — full templating would be overkill here.
   */
  private renderTitle(template: string, now: Date): string {
    if (!template) return `Bon récurrent — ${now.toISOString().slice(0, 10)}`;
    return template.replace(/\{\{\s*date\s*\}\}/g, now.toISOString().slice(0, 10));
  }
}
