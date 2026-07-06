import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  computeFirstRun,
  computeNextRun,
  isValidFrequency,
  previewNextRuns,
  type Frequency,
  type ScheduleSpec,
} from '../domain/schedule';

/**
 * B11 — CRUD for recurring work-order definitions.
 *
 * The service owns:
 *   - Input validation (frequency, interval, day arrays)
 *   - Initial `nextRunAt` computation on create / on schedule update
 *   - The `previewNextRuns` UI helper (dry-run of the schedule)
 *
 * The actual spawning of WorkOrders happens in `RecurringSpawnerService`.
 */
@Injectable()
export class RecurringWorkOrdersService {
  private readonly logger = new Logger(RecurringWorkOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(input: CreateRecurringInput): Promise<RecurringRow> {
    this.validate(input);
    const spec = this.buildSpec(input);
    const nextRunAt = computeFirstRun(spec, new Date());

    const row = await this.prisma.recurringWorkOrder.create({
      data: {
        tenantId: input.tenantId,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        isActive: input.isActive ?? true,
        taskTypeId: input.taskTypeId,
        clientId: input.clientId,
        clientAddressId: input.clientAddressId ?? null,
        assignedToId: input.assignedToId ?? null,
        workOrderTitle: input.workOrderTitle ?? '',
        workOrderDescription: input.workOrderDescription ?? '',
        priority: input.priority ?? 0,
        frequency: input.frequency,
        interval: input.interval ?? 1,
        byDayOfWeek: input.byDayOfWeek ?? [],
        byDayOfMonth: input.byDayOfMonth ?? [],
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        nextRunAt,
        createdByUserId: input.createdByUserId,
      },
      select: baseSelect,
    });

    this.eventEmitter.emit('recurring.workOrder.created', {
      eventName: 'recurring.workOrder.created',
      occurredAt: new Date(),
      aggregateId: row.id,
      tenantId: input.tenantId,
      actorUserId: input.createdByUserId,
      data: { name: row.name, frequency: row.frequency },
    });

    return row;
  }

  async list(tenantId: string): Promise<RecurringRow[]> {
    return this.prisma.recurringWorkOrder.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { nextRunAt: 'asc' }],
      select: baseSelect,
    });
  }

  async findOne(tenantId: string, id: string): Promise<RecurringRow> {
    const row = await this.prisma.recurringWorkOrder.findFirst({
      where: { id, tenantId },
      select: baseSelect,
    });
    if (!row) throw new NotFoundException('Bon récurrent introuvable');
    return row;
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateRecurringInput,
  ): Promise<RecurringRow> {
    const existing = await this.prisma.recurringWorkOrder.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        frequency: true,
        interval: true,
        byDayOfWeek: true,
        byDayOfMonth: true,
        startDate: true,
        endDate: true,
      },
    });
    if (!existing) throw new NotFoundException('Bon récurrent introuvable');

    // Merge existing schedule fields with the patch so we can validate + recompute.
    const merged: ScheduleSpec = {
      frequency: (input.frequency ?? existing.frequency) as Frequency,
      interval: input.interval ?? existing.interval,
      byDayOfWeek: input.byDayOfWeek ?? existing.byDayOfWeek,
      byDayOfMonth: input.byDayOfMonth ?? existing.byDayOfMonth,
      startDate: input.startDate ?? existing.startDate,
      endDate: input.endDate === undefined ? existing.endDate : input.endDate,
    };
    if (this.scheduleTouched(input)) {
      this.validate({ ...input, ...merged });
    }

    const nextRunAtIfChanged = this.scheduleTouched(input)
      ? computeFirstRun(merged, new Date())
      : undefined;

    const row = await this.prisma.recurringWorkOrder.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && {
          description: input.description.trim(),
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.taskTypeId !== undefined && { taskTypeId: input.taskTypeId }),
        ...(input.clientId !== undefined && { clientId: input.clientId }),
        ...(input.clientAddressId !== undefined && {
          clientAddressId: input.clientAddressId,
        }),
        ...(input.assignedToId !== undefined && {
          assignedToId: input.assignedToId,
        }),
        ...(input.workOrderTitle !== undefined && {
          workOrderTitle: input.workOrderTitle,
        }),
        ...(input.workOrderDescription !== undefined && {
          workOrderDescription: input.workOrderDescription,
        }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.frequency !== undefined && { frequency: input.frequency }),
        ...(input.interval !== undefined && { interval: input.interval }),
        ...(input.byDayOfWeek !== undefined && {
          byDayOfWeek: input.byDayOfWeek,
        }),
        ...(input.byDayOfMonth !== undefined && {
          byDayOfMonth: input.byDayOfMonth,
        }),
        ...(input.startDate !== undefined && { startDate: input.startDate }),
        ...(input.endDate !== undefined && { endDate: input.endDate }),
        ...(nextRunAtIfChanged && { nextRunAt: nextRunAtIfChanged }),
      },
      select: baseSelect,
    });

    this.eventEmitter.emit('recurring.workOrder.updated', {
      eventName: 'recurring.workOrder.updated',
      occurredAt: new Date(),
      aggregateId: row.id,
      tenantId,
      data: { name: row.name, isActive: row.isActive },
    });

    return row;
  }

  async remove(
    tenantId: string,
    id: string,
    actorUserId: string,
  ): Promise<void> {
    const existing = await this.prisma.recurringWorkOrder.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true },
    });
    if (!existing) throw new NotFoundException('Bon récurrent introuvable');
    await this.prisma.recurringWorkOrder.delete({ where: { id } });
    this.eventEmitter.emit('recurring.workOrder.deleted', {
      eventName: 'recurring.workOrder.deleted',
      occurredAt: new Date(),
      aggregateId: id,
      tenantId,
      actorUserId,
      data: { name: existing.name },
    });
  }

  /**
   * Dry-run the schedule — used by the UI to show « les 5 prochaines
   * dates » before saving. Returns dates in ISO order.
   */
  preview(input: PreviewInput, count = 5): Date[] {
    this.validate(input);
    const spec = this.buildSpec(input);
    return previewNextRuns(spec, count);
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private buildSpec(input: {
    frequency: string;
    interval?: number;
    byDayOfWeek?: number[];
    byDayOfMonth?: number[];
    startDate: Date;
    endDate?: Date | null;
  }): ScheduleSpec {
    return {
      frequency: input.frequency as Frequency,
      interval: input.interval ?? 1,
      byDayOfWeek: input.byDayOfWeek ?? [],
      byDayOfMonth: input.byDayOfMonth ?? [],
      startDate: input.startDate,
      endDate: input.endDate ?? null,
    };
  }

  private scheduleTouched(input: UpdateRecurringInput): boolean {
    return (
      input.frequency !== undefined ||
      input.interval !== undefined ||
      input.byDayOfWeek !== undefined ||
      input.byDayOfMonth !== undefined ||
      input.startDate !== undefined ||
      input.endDate !== undefined
    );
  }

  private validate(input: {
    frequency?: string;
    interval?: number;
    byDayOfWeek?: number[];
    byDayOfMonth?: number[];
    startDate?: Date;
    endDate?: Date | null;
  }): void {
    if (input.frequency && !isValidFrequency(input.frequency)) {
      throw new BadRequestException(
        `Fréquence invalide (${input.frequency}). Valeurs acceptées : DAILY, WEEKLY, MONTHLY, YEARLY.`,
      );
    }
    if (input.interval !== undefined) {
      if (!Number.isInteger(input.interval) || input.interval < 1 || input.interval > 366) {
        throw new BadRequestException('L\'intervalle doit être un entier entre 1 et 366.');
      }
    }
    if (input.byDayOfWeek) {
      for (const d of input.byDayOfWeek) {
        if (!Number.isInteger(d) || d < 0 || d > 6) {
          throw new BadRequestException(
            'byDayOfWeek doit contenir des entiers entre 0 (dimanche) et 6 (samedi).',
          );
        }
      }
    }
    if (input.byDayOfMonth) {
      for (const d of input.byDayOfMonth) {
        if (!Number.isInteger(d) || d < 1 || d > 31) {
          throw new BadRequestException(
            'byDayOfMonth doit contenir des entiers entre 1 et 31.',
          );
        }
      }
    }
    if (input.startDate && input.endDate) {
      if (input.endDate.getTime() < input.startDate.getTime()) {
        throw new BadRequestException(
          'La date de fin doit être postérieure à la date de début.',
        );
      }
    }
  }
}

// ─── Public helpers used by the Spawner ────────────────────────

export function advanceNextRunAfterSpawn(row: RecurringRow, now: Date): Date {
  const spec: ScheduleSpec = {
    frequency: row.frequency as Frequency,
    interval: row.interval,
    byDayOfWeek: row.byDayOfWeek,
    byDayOfMonth: row.byDayOfMonth,
    startDate: row.startDate,
    endDate: row.endDate,
  };
  return computeNextRun(spec, now, row.nextRunAt);
}

// ─── Types ─────────────────────────────────────────────────────

const baseSelect = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  taskTypeId: true,
  clientId: true,
  clientAddressId: true,
  assignedToId: true,
  workOrderTitle: true,
  workOrderDescription: true,
  priority: true,
  frequency: true,
  interval: true,
  byDayOfWeek: true,
  byDayOfMonth: true,
  startDate: true,
  endDate: true,
  nextRunAt: true,
  lastRunAt: true,
  spawnedCount: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface RecurringRow {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  taskTypeId: string;
  clientId: string;
  clientAddressId: string | null;
  assignedToId: string | null;
  workOrderTitle: string;
  workOrderDescription: string;
  priority: number;
  frequency: string;
  interval: number;
  byDayOfWeek: number[];
  byDayOfMonth: number[];
  startDate: Date;
  endDate: Date | null;
  nextRunAt: Date;
  lastRunAt: Date | null;
  spawnedCount: number;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRecurringInput {
  tenantId: string;
  createdByUserId: string;
  name: string;
  description?: string;
  isActive?: boolean;
  taskTypeId: string;
  clientId: string;
  clientAddressId?: string | null;
  assignedToId?: string | null;
  workOrderTitle?: string;
  workOrderDescription?: string;
  priority?: number;
  frequency: string;
  interval?: number;
  byDayOfWeek?: number[];
  byDayOfMonth?: number[];
  startDate: Date;
  endDate?: Date | null;
}

export type UpdateRecurringInput = Partial<
  Omit<CreateRecurringInput, 'tenantId' | 'createdByUserId'>
>;

export interface PreviewInput {
  frequency: string;
  interval?: number;
  byDayOfWeek?: number[];
  byDayOfMonth?: number[];
  startDate: Date;
  endDate?: Date | null;
}
