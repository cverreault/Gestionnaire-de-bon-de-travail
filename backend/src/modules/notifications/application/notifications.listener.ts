import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { IDomainEvent } from '../../../common/contracts/domain-event.interface';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { EmailChannelService } from '../infrastructure/channels/email-channel.service';

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
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('workOrders.workOrder.assigned', { async: true, promisify: true })
  async onWorkOrderAssigned(event: WorkOrderEvent) {
    try {
      const data = event.data;

      // 1. Persist the in-app row.
      const row = await this.notifications.create({
        userId: data.technicianId,
        type: 'workOrder.assigned',
        title: 'Nouveau bon de travail assigné',
        body: 'Un bon de travail vient de vous être assigné.',
        aggregateId: event.aggregateId,
        data: {
          workOrderId: event.aggregateId,
          previousTechnicianId: data.previousTechnicianId,
        },
      });

      // 2. Try the email channel. Resolve recipient address by reading
      //    the users table directly — see file docstring for why.
      const channels = await this.deliverEmail(row.id, data.technicianId);

      // 3. Flip status. In-app always counts as a success — the row
      //    already exists in the user's inbox. The email channel is
      //    additive: it shows up in channelsSent if it worked.
      await this.notifications.markSent(row.id, ['in-app', ...channels]);
    } catch (err) {
      this.logger.error(
        `Failed to handle assigned event ${event.eventId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async deliverEmail(notificationId: string, userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user?.email) {
      this.logger.warn(`No email on file for user=${userId}; skipping email channel`);
      return [];
    }

    const ok = await this.email.send({
      to: user.email,
      subject: 'Nouveau bon de travail assigné',
      text:
        `Bonjour ${user.firstName ?? ''},\n\n` +
        `Un nouveau bon de travail vient de vous être assigné. Connectez-vous à TaskMgr pour le consulter.\n\n` +
        `— TaskMgr`,
    });

    return ok ? ['email'] : [];
  }
}
