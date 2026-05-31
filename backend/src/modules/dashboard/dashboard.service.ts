import { Injectable, Logger } from '@nestjs/common';
import { WorkOrderStatus, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

// ── Shared status groups ───────────────────────────────────────────────────────

const COMPLETED_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.COMPLETED_POSITIVE,
  WorkOrderStatus.COMPLETED_NEGATIVE,
];

const ACTIVE_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.CREATED,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.DISPATCHED,
  WorkOrderStatus.IN_PROGRESS,
];

const TECHNICIAN_ACTIVE_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.DISPATCHED,
  WorkOrderStatus.IN_PROGRESS,
];

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Date helpers ───────────────────────────────────────────────────────────

  /** Returns the [00:00:00.000, 23:59:59.999] window for the given date. */
  private dayBounds(date: Date): { start: Date; end: Date } {
    const start = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0, 0, 0, 0,
    );
    const end = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23, 59, 59, 999,
    );
    return { start, end };
  }

  /**
   * Returns the ISO-week [Monday 00:00, Sunday 23:59:59.999] window
   * for the week containing the given date.
   */
  private weekBounds(date: Date): { start: Date; end: Date } {
    const day = date.getDay(); // 0 = Sunday
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + diffToMonday,
      0, 0, 0, 0,
    );
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }

  // ── Admin stats ────────────────────────────────────────────────────────────

  /**
   * Global KPIs for administrators:
   * - Work orders by status
   * - Work orders created today / this week
   * - Overdue work orders
   * - Per-technician workload (active + completed today)
   * - 10 most recently created work orders
   */
  async getAdminStats(query: DashboardQueryDto) {
    const ref = query.referenceDate ? new Date(query.referenceDate) : new Date();
    const { start: todayStart, end: todayEnd } = this.dayBounds(ref);
    const { start: weekStart, end: weekEnd } = this.weekBounds(ref);

    // ── Run independent DB queries in parallel ────────────────────────────────

    const [
      workOrdersByStatusRaw,
      workOrdersToday,
      workOrdersThisWeek,
      overdueWorkOrders,
      activeTechnicians,
      recentWorkOrders,
    ] = await Promise.all([
      // Count grouped by status
      this.prisma.workOrder.groupBy({
        by: ['status'],
        _count: { id: true },
        orderBy: { status: 'asc' },
      }),

      // Work orders created today
      this.prisma.workOrder.count({
        where: { createdAt: { gte: todayStart, lte: todayEnd } },
      }),

      // Work orders created this week
      this.prisma.workOrder.count({
        where: { createdAt: { gte: weekStart, lte: weekEnd } },
      }),

      // Overdue: scheduled date is in the past and still not completed
      this.prisma.workOrder.count({
        where: {
          scheduledDate: { lt: ref },
          status: { notIn: COMPLETED_STATUSES },
        },
      }),

      // All active technicians with their currently active work orders
      this.prisma.user.findMany({
        where: { isActive: true, role: Role.TECHNICIAN },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          assignedWorkOrders: {
            where: { status: { in: ACTIVE_STATUSES } },
            select: { id: true },
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),

      // 10 most recently created work orders (lightweight)
      this.prisma.workOrder.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: {
            select: { id: true, firstName: true, lastName: true },
          },
          temporaryClient: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    // ── Per-technician completedToday (second query, depends on technician list) ─

    const technicianIds = activeTechnicians.map((t) => t.id);

    const completedTodayRows =
      technicianIds.length > 0
        ? await this.prisma.workOrder.groupBy({
            by: ['assignedToId'],
            _count: { id: true },
            where: {
              assignedToId: { in: technicianIds },
              status: { in: COMPLETED_STATUSES },
              actualEndTime: { gte: todayStart, lte: todayEnd },
            },
          })
        : [];

    const completedTodayMap = new Map<string, number>();
    completedTodayRows.forEach((row) => {
      if (row.assignedToId) {
        completedTodayMap.set(row.assignedToId, row._count.id);
      }
    });

    const technicianStats = activeTechnicians.map((tech) => ({
      id: tech.id,
      name: `${tech.firstName} ${tech.lastName}`,
      activeWorkOrders: tech.assignedWorkOrders.length,
      completedToday: completedTodayMap.get(tech.id) ?? 0,
    }));

    this.logger.log('Admin dashboard stats computed');

    return {
      workOrdersByStatus: workOrdersByStatusRaw.map((r) => ({
        status: r.status,
        count: r._count.id,
      })),
      workOrdersToday,
      workOrdersThisWeek,
      overdueWorkOrders,
      technicianStats,
      recentWorkOrders,
    };
  }

  // ── Technician stats ───────────────────────────────────────────────────────

  /**
   * Personal KPIs for the connected technician:
   * - Active work orders count
   * - Completed today / this week
   * - Upcoming scheduled work orders (next 10)
   * - Overdue count
   */
  async getTechnicianStats(userId: string, query: DashboardQueryDto) {
    const ref = query.referenceDate ? new Date(query.referenceDate) : new Date();
    const { start: todayStart, end: todayEnd } = this.dayBounds(ref);
    const { start: weekStart, end: weekEnd } = this.weekBounds(ref);

    const [
      myActiveWorkOrders,
      myCompletedToday,
      myCompletedThisWeek,
      myUpcoming,
      myOverdue,
    ] = await Promise.all([
      // Work orders currently in progress / assigned / dispatched
      this.prisma.workOrder.count({
        where: {
          assignedToId: userId,
          status: { in: TECHNICIAN_ACTIVE_STATUSES },
        },
      }),

      // Completed today (by actual end time)
      this.prisma.workOrder.count({
        where: {
          assignedToId: userId,
          status: { in: COMPLETED_STATUSES },
          actualEndTime: { gte: todayStart, lte: todayEnd },
        },
      }),

      // Completed this week (by actual end time)
      this.prisma.workOrder.count({
        where: {
          assignedToId: userId,
          status: { in: COMPLETED_STATUSES },
          actualEndTime: { gte: weekStart, lte: weekEnd },
        },
      }),

      // Upcoming: scheduled in the future (or today), not yet completed — next 10
      this.prisma.workOrder.findMany({
        where: {
          assignedToId: userId,
          scheduledDate: { gte: ref },
          status: { notIn: COMPLETED_STATUSES },
        },
        orderBy: [
          { scheduledDate: 'asc' },
          { scheduledStartTime: 'asc' },
          { priority: 'desc' },
        ],
        take: 10,
        include: {
          temporaryClient: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),

      // Overdue: scheduled date in the past, still not completed
      this.prisma.workOrder.count({
        where: {
          assignedToId: userId,
          scheduledDate: { lt: ref },
          status: { notIn: COMPLETED_STATUSES },
        },
      }),
    ]);

    this.logger.log(`Technician dashboard stats computed for user ${userId}`);

    return {
      myActiveWorkOrders,
      myCompletedToday,
      myCompletedThisWeek,
      myUpcoming,
      myOverdue,
    };
  }
}
