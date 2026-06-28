import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  NOTIFICATION_EVENT_NAMES,
  notificationSent,
} from '../domain/events/notification-events';

/**
 * Domain service for the notifications module.
 *
 * Listener creates rows; channel adapters (email, push) call back through
 * `markSent()`; the controller queries `findForUser()` and toggles
 * `markRead()`.
 *
 * Channel delivery is intentionally NOT in this service — that lives
 * under `infrastructure/` once we wire nodemailer + VAPID. For B1.1.a
 * the only "delivery" is the persisted row + the dropdown in the UI.
 */

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  aggregateId?: string;
  data?: unknown;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async create(input: CreateNotificationInput) {
    const row = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        aggregateId: input.aggregateId ?? null,
        data: (input.data ?? null) as never,
      },
    });

    this.logger.log(
      `📨 Notification created: id=${row.id} user=${input.userId} type=${input.type}`,
    );

    return row;
  }

  /**
   * Marks the row as SENT and records which channels succeeded. Idempotent
   * by `id` — calling twice with the same channels yields the same state.
   * Emits `notifications.notification.sent` so consumers (analytics, audit
   * already auto-records via wildcard) can react.
   */
  async markSent(id: string, channels: string[]) {
    const updated = await this.prisma.notification.update({
      where: { id },
      data: {
        status: 'SENT',
        channelsSent: channels as unknown as never,
        sentAt: new Date(),
      },
    });

    this.eventEmitter.emit(
      NOTIFICATION_EVENT_NAMES.SENT,
      notificationSent(id, {
        userId: updated.userId,
        type: updated.type,
        channels,
      }),
    );

    return updated;
  }

  // ── Reads (for the dropdown) ──────────────────────────────────────────────

  async findForUser(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const where = {
      userId,
      ...(opts.unreadOnly ? { readAt: null } : {}),
    };

    const [items, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
        take: limit,
      }),
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return { items, unreadCount };
  }

  // ── Mark-as-read (user action) ────────────────────────────────────────────

  async markRead(id: string, userId: string) {
    // Object-level RBAC : a user can only mark their own notifications.
    const existing = await this.prisma.notification.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Notification #${id} introuvable`);
    if (existing.userId !== userId) {
      throw new NotFoundException(`Notification #${id} introuvable`);
    }

    if (existing.readAt) return existing;

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: result.count };
  }
}
