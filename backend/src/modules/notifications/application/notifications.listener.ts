import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { IDomainEvent } from '../../../common/contracts/domain-event.interface';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { EmailChannelService } from '../infrastructure/channels/email-channel.service';
import { PushChannelService } from '../infrastructure/channels/push-channel.service';
import type { NotifiableEvent } from './notification-preferences';

/**
 * First cross-module reactor that is NOT audit. Listens for the events
 * we want to surface to users and translates each into:
 *
 *   1. an in-app Notification row (always)
 *   2. an email if SMTP is configured AND we can resolve the recipient
 *      email (defaults to "yes")
 *
 * The audit module already records every event for compliance — this
 * listener is purely "what should the human user be told about".
 *
 * Direct Prisma read on `users` is justified: the alternative would be
 * importing UsersService (cross-module hard dep) just to look up an
 * email. The audit + search modules use the same shortcut and it is
 * documented as an exception in audit.md / search.md.
 */

interface WorkOrderAssignedData {
  technicianId: string;
  previousTechnicianId: string | null;
}

interface WorkOrderEvent extends IDomainEvent {
  data: WorkOrderAssignedData;
}

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly email: EmailChannelService,
    private readonly push: PushChannelService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('workOrders.workOrder.assigned', { async: true, promisify: true })
  async onWorkOrderAssigned(event: WorkOrderEvent) {
    try {
      const data = event.data;
      const eventType: NotifiableEvent = 'workOrder.assigned';

      // Resolve the recipient's preferences once for this dispatch.
      // Defaults to in-app + email when no prefs have been written.
      const prefs = await this.notifications.getPreferences(data.technicianId);
      const eventPrefs = prefs[eventType];

      // If the user opted out of in-app too, we still create the row —
      // dropping it would lose audit. But channelsSent will reflect
      // what was actually delivered.
      const row = await this.notifications.create({
        userId: data.technicianId,
        type: eventType,
        title: 'Nouveau bon de travail assigné',
        body: 'Un bon de travail vient de vous être assigné.',
        aggregateId: event.aggregateId,
        data: {
          workOrderId: event.aggregateId,
          previousTechnicianId: data.previousTechnicianId,
        },
      });

      const channels: string[] = [];
      // In-app is satisfied by the row's existence.
      if (eventPrefs.inApp) channels.push('in-app');
      if (eventPrefs.email) {
        const ok = await this.deliverEmail(data.technicianId);
        if (ok) channels.push('email');
      }
      if (eventPrefs.push) {
        const ok = await this.push.send({
          userId: data.technicianId,
          title: 'Nouveau BT assigné',
          body: 'Un bon de travail vient de vous être assigné.',
          url: `/bons-de-travail/${event.aggregateId}`,
        });
        if (ok) channels.push('push');
      }

      await this.notifications.markSent(row.id, channels);
    } catch (err) {
      this.logger.error(
        `Failed to handle assigned event ${event.eventId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Resolve recipient email + send. Returns true on success. */
  private async deliverEmail(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user?.email) {
      this.logger.warn(`No email on file for user=${userId}; skipping email channel`);
      return false;
    }

    return this.email.send({
      to: user.email,
      subject: 'Nouveau bon de travail assigné',
      text:
        `Bonjour ${user.firstName ?? ''},\n\n` +
        `Un nouveau bon de travail vient de vous être assigné. Connectez-vous à TaskMgr pour le consulter.\n\n` +
        `— TaskMgr`,
    });
  }
}
