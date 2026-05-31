import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { CalendarQueryDto, CalendarView } from './dto/calendar-query.dto';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  type: 'appointment' | 'work_order';
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  technicianId?: string | null;
  technicianName?: string | null;
  workOrderId?: string | null;
  status?: WorkOrderStatus;
  color?: string;
}

/** WorkOrderStatus → hex color for calendar display */
const STATUS_COLORS: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.CREATED]:            '#9E9E9E',
  [WorkOrderStatus.ASSIGNED]:           '#2196F3',
  [WorkOrderStatus.DISPATCHED]:         '#FF9800',
  [WorkOrderStatus.EN_ROUTE]:           '#7c3aed',
  [WorkOrderStatus.IN_PROGRESS]:        '#4CAF50',
  [WorkOrderStatus.COMPLETED_POSITIVE]: '#8BC34A',
  [WorkOrderStatus.COMPLETED_NEGATIVE]: '#F44336',
};

/** Default color for standalone appointments */
const APPOINTMENT_COLOR = '#7B68EE';

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Date-range helpers ─────────────────────────────────────────────────────

  /**
   * Computes a { start, end } range anchored on today for a given calendar view.
   * Week starts on Monday (ISO week).
   */
  private computeDateRange(view: CalendarView): { start: Date; end: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (view) {
      case CalendarView.DAY: {
        const start = new Date(today);
        const end = new Date(today);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }

      case CalendarView.THREE_DAYS: {
        const start = new Date(today);
        const end = new Date(today);
        end.setDate(end.getDate() + 2);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }

      case CalendarView.WEEK: {
        // Monday of the current ISO week
        const day = today.getDay(); // 0 = Sunday
        const diff = day === 0 ? -6 : 1 - day;
        const start = new Date(today);
        start.setDate(today.getDate() + diff);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }

      case CalendarView.MONTH: {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }

      default: {
        // Fallback to week
        const day = today.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        const start = new Date(today);
        start.setDate(today.getDate() + diff);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  /**
   * Returns all calendar events (appointments + work orders) in the requested range.
   * If startDate/endDate are not provided, the range is derived from `view`.
   */
  async getEvents(
    query: CalendarQueryDto,
  ): Promise<{ events: CalendarEvent[]; warnings: string[] }> {
    let start: Date;
    let end: Date;

    if (query.startDate && query.endDate) {
      start = new Date(query.startDate);
      end = new Date(query.endDate);
    } else {
      const range = this.computeDateRange(query.view ?? CalendarView.WEEK);
      start = range.start;
      end = range.end;
    }

    const warnings: string[] = [];

    // ── Appointments ──────────────────────────────────────────────────────────

    const apptWhere: Prisma.AppointmentWhereInput = {
      // Overlap condition: appointment starts before range end AND ends after range start
      startTime: { lte: end },
      endTime: { gte: start },
    };
    if (query.technicianId) {
      apptWhere.technicianId = query.technicianId;
    }

    const appointments = await this.prisma.appointment.findMany({
      where: apptWhere,
      orderBy: { startTime: 'asc' },
    });

    // Batch-fetch technician names referenced by appointments
    const apptTechIds = [
      ...new Set(
        appointments.map((a) => a.technicianId).filter(Boolean) as string[],
      ),
    ];

    const techMap = new Map<string, string>();
    if (apptTechIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: apptTechIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      users.forEach((u) =>
        techMap.set(u.id, `${u.firstName} ${u.lastName}`),
      );
    }

    const appointmentEvents: CalendarEvent[] = appointments.map((appt) => ({
      id: appt.id,
      type: 'appointment' as const,
      title: appt.title,
      description: appt.description,
      startTime: appt.startTime,
      endTime: appt.endTime,
      technicianId: appt.technicianId,
      technicianName: appt.technicianId
        ? (techMap.get(appt.technicianId) ?? null)
        : null,
      workOrderId: appt.workOrderId,
      color: APPOINTMENT_COLOR,
    }));

    // ── Work Orders ───────────────────────────────────────────────────────────

    const woWhere: Prisma.WorkOrderWhereInput = {
      scheduledDate: { gte: start, lte: end },
    };
    if (query.technicianId) {
      woWhere.assignedToId = query.technicianId;
    }

    const workOrders = await this.prisma.workOrder.findMany({
      where: woWhere,
      select: {
        id: true,
        title: true,
        description: true,
        scheduledDate: true,
        scheduledStartTime: true,
        scheduledEndTime: true,
        status: true,
        assignedToId: true,
        assignedTo: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ scheduledStartTime: 'asc' }, { scheduledDate: 'asc' }],
    });

    const workOrderEvents: CalendarEvent[] = workOrders.map((wo) => {
      // If specific times are set, use them; otherwise treat as all-day event
      let startTime: Date;
      let endTime: Date;

      if (wo.scheduledStartTime && wo.scheduledEndTime) {
        startTime = wo.scheduledStartTime;
        endTime = wo.scheduledEndTime;
      } else {
        // All-day fallback: span the entire scheduled day
        const d = wo.scheduledDate!;
        startTime = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        endTime = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      }

      return {
        id: wo.id,
        type: 'work_order' as const,
        title: wo.title,
        description: wo.description,
        startTime,
        endTime,
        technicianId: wo.assignedToId,
        technicianName: wo.assignedTo
          ? `${wo.assignedTo.firstName} ${wo.assignedTo.lastName}`
          : null,
        workOrderId: wo.id,
        status: wo.status,
        color: STATUS_COLORS[wo.status],
      };
    });

    // ── Merge and sort chronologically ────────────────────────────────────────

    const events = [...appointmentEvents, ...workOrderEvents].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    return { events, warnings };
  }

  // ── Appointments CRUD ──────────────────────────────────────────────────────

  async createAppointment(dto: CreateAppointmentDto) {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (endTime <= startTime) {
      throw new BadRequestException(
        'La date de fin doit être postérieure à la date de début',
      );
    }

    const warnings: string[] = [];

    // Overlap detection — warning only, not a blocker
    if (dto.technicianId) {
      const overlapping = await this.detectOverlap(
        dto.technicianId,
        startTime,
        endTime,
      );
      if (overlapping) {
        warnings.push(
          `Attention : le technicien a déjà un événement qui chevauche cette plage horaire (${dto.startTime} – ${dto.endTime})`,
        );
      }
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        startTime,
        endTime,
        technicianId: dto.technicianId ?? null,
        workOrderId: dto.workOrderId ?? null,
      },
    });

    this.logger.log(`Appointment created: ${appointment.id}`);
    return { data: appointment, warnings };
  }

  async findOneAppointment(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException(`Rendez-vous #${id} introuvable`);
    }

    return appointment;
  }

  async updateAppointment(id: string, dto: UpdateAppointmentDto) {
    const current = await this.findOneAppointment(id);

    const startTime = dto.startTime ? new Date(dto.startTime) : undefined;
    const endTime = dto.endTime ? new Date(dto.endTime) : undefined;

    // Validate the time range if either bound changed
    const resolvedStart = startTime ?? current.startTime;
    const resolvedEnd = endTime ?? current.endTime;

    if (resolvedEnd <= resolvedStart) {
      throw new BadRequestException(
        'La date de fin doit être postérieure à la date de début',
      );
    }

    const warnings: string[] = [];

    // Overlap check (exclude the appointment being updated)
    const resolvedTechId =
      dto.technicianId !== undefined ? dto.technicianId : current.technicianId;

    if (resolvedTechId) {
      const overlapping = await this.detectOverlap(
        resolvedTechId,
        resolvedStart,
        resolvedEnd,
        id,
      );
      if (overlapping) {
        warnings.push(
          `Attention : le technicien a déjà un événement qui chevauche cette plage horaire`,
        );
      }
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(startTime !== undefined && { startTime }),
        ...(endTime !== undefined && { endTime }),
        ...(dto.technicianId !== undefined && { technicianId: dto.technicianId }),
        ...(dto.workOrderId !== undefined && { workOrderId: dto.workOrderId }),
      },
    });

    this.logger.log(`Appointment updated: ${id}`);
    return { data: updated, warnings };
  }

  async deleteAppointment(id: string): Promise<{ message: string }> {
    await this.findOneAppointment(id);
    await this.prisma.appointment.delete({ where: { id } });
    this.logger.log(`Appointment deleted: ${id}`);
    return { message: `Rendez-vous #${id} supprimé avec succès` };
  }

  // ── Overlap detection ──────────────────────────────────────────────────────

  /**
   * Returns true if the technician already has an appointment overlapping
   * [startTime, endTime], optionally excluding the appointment with `excludeId`.
   *
   * Overlap condition (Allen's interval algebra):
   *   existing.startTime < newEnd  AND  existing.endTime > newStart
   */
  private async detectOverlap(
    technicianId: string,
    startTime: Date,
    endTime: Date,
    excludeId?: string,
  ): Promise<boolean> {
    const hit = await this.prisma.appointment.findFirst({
      where: {
        technicianId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { id: true },
    });
    return hit !== null;
  }
}
