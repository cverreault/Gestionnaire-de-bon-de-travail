import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * B15 — Work-order reminder CRUD.
 *
 * Two creation paths :
 *   • `scheduleDefaultsForWorkOrder()` — called by WorkOrdersService right
 *     after a WO is created with a `scheduledDate`. Spawns two reminders
 *     (24 h and 1 h before) at the default channels of the tenant.
 *   • `create(input)` — dispatcher-created one-off from the UI.
 *
 * The actual dispatch happens in `RemindersDispatcher` (Cron sweeper).
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  /** Default lead times in hours before the WO's scheduled date. */
  private static readonly DEFAULT_LEAD_HOURS = [24, 1];
  private static readonly DEFAULT_CHANNELS = ['inApp', 'email'];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called by WorkOrdersService when a WO gets a scheduledDate. Idempotent:
   * running twice for the same WO leaves the same reminders in place.
   */
  async scheduleDefaultsForWorkOrder(
    tenantId: string,
    workOrderId: string,
    scheduledDate: Date,
    createdByUserId: string,
  ): Promise<void> {
    const now = Date.now();
    const rows: Array<{
      tenantId: string;
      workOrderId: string;
      sendAt: Date;
      channels: string[];
      createdByUserId: string;
    }> = [];
    for (const leadHours of RemindersService.DEFAULT_LEAD_HOURS) {
      const sendAt = new Date(scheduledDate.getTime() - leadHours * 3600_000);
      if (sendAt.getTime() <= now) continue; // in the past → skip
      rows.push({
        tenantId,
        workOrderId,
        sendAt,
        channels: [...RemindersService.DEFAULT_CHANNELS],
        createdByUserId,
      });
    }
    if (rows.length === 0) return;
    // Use skipDuplicates via a manual guard — we only spawn defaults ONCE.
    const existing = await this.prisma.workOrderReminder.findMany({
      where: { workOrderId, createdByUserId },
      select: { sendAt: true },
    });
    const existingAt = new Set(
      existing.map((e) => e.sendAt.toISOString()),
    );
    const fresh = rows.filter((r) => !existingAt.has(r.sendAt.toISOString()));
    if (fresh.length === 0) return;
    await this.prisma.workOrderReminder.createMany({ data: fresh });
  }

  async list(tenantId: string, workOrderId: string): Promise<ReminderRow[]> {
    return this.prisma.workOrderReminder.findMany({
      where: { tenantId, workOrderId },
      orderBy: { sendAt: 'asc' },
      select: baseSelect,
    });
  }

  async create(input: CreateReminderInput): Promise<ReminderRow> {
    const sendAt = new Date(input.sendAt);
    if (Number.isNaN(sendAt.getTime())) {
      throw new BadRequestException('Date d\'envoi invalide.');
    }
    if (sendAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'La date d\'envoi doit être dans le futur.',
      );
    }
    if (!input.channels || input.channels.length === 0) {
      throw new BadRequestException(
        'Au moins un canal (inApp / email / sms) doit être sélectionné.',
      );
    }
    // Ensure the WO belongs to the tenant.
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: input.workOrderId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!wo) throw new NotFoundException('Bon de travail introuvable.');

    return this.prisma.workOrderReminder.create({
      data: {
        tenantId: input.tenantId,
        workOrderId: input.workOrderId,
        sendAt,
        channels: input.channels,
        bodyTemplate: input.bodyTemplate ?? null,
        createdByUserId: input.createdByUserId,
      },
      select: baseSelect,
    });
  }

  async cancel(tenantId: string, id: string): Promise<void> {
    const row = await this.prisma.workOrderReminder.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!row) throw new NotFoundException('Rappel introuvable.');
    if (row.status !== 'pending') {
      throw new BadRequestException(
        'Ce rappel ne peut plus être annulé (déjà envoyé ou en erreur).',
      );
    }
    await this.prisma.workOrderReminder.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }
}

// ─── Types ────────────────────────────────────────────────────────

const baseSelect = {
  id: true,
  workOrderId: true,
  sendAt: true,
  channels: true,
  bodyTemplate: true,
  status: true,
  sentAt: true,
  errorMessage: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface ReminderRow {
  id: string;
  workOrderId: string;
  sendAt: Date;
  channels: string[];
  bodyTemplate: string | null;
  status: string;
  sentAt: Date | null;
  errorMessage: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReminderInput {
  tenantId: string;
  workOrderId: string;
  createdByUserId: string;
  sendAt: string | Date;
  channels: string[];
  bodyTemplate?: string | null;
}
