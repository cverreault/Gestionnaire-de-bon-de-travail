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

interface WorkOrderSlaBreachedData {
  slaTargetAt: string;
  detectedAt: string;
  slaHours: number | null;
  assignedToId: string | null;
}

interface WorkOrderSlaBreachedEvent extends IDomainEvent {
  data: WorkOrderSlaBreachedData;
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
      await this.dispatchOne(
        data.technicianId,
        'workOrder.assigned',
        {
          title: 'Nouveau bon de travail assigné',
          body: 'Un bon de travail vient de vous être assigné.',
          aggregateId: event.aggregateId,
          data: {
            workOrderId: event.aggregateId,
            previousTechnicianId: data.previousTechnicianId,
          },
        },
        {
          subject: 'Nouveau BT assigné',
          body: 'Un bon de travail vient de vous être assigné.',
          url: `/bons-de-travail/${event.aggregateId}`,
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to handle assigned event ${event.eventId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * SLA breach (B4.c) — notify the assigned tech AND every admin /
   * dispatcher so the team can react. The breach is also persisted in
   * the audit log automatically by the wildcard listener.
   */
  @OnEvent('workOrders.workOrder.slaBreached', { async: true, promisify: true })
  async onWorkOrderSlaBreached(event: WorkOrderSlaBreachedEvent) {
    try {
      const recipients = await this.resolveSlaRecipients(event.data.assignedToId);
      if (recipients.length === 0) {
        this.logger.warn(`SLA breach on BT ${event.aggregateId}: no recipients to notify`);
        return;
      }

      const title = '⚠️ SLA dépassé sur un bon de travail';
      const body  =
        `Le BT vient de dépasser son délai prévu` +
        (event.data.slaHours ? ` (${event.data.slaHours}h après création)` : '') +
        '. Action requise.';

      for (const recipient of recipients) {
        await this.dispatchOne(
          recipient.id,
          'workOrder.slaBreached',
          { title, body, aggregateId: event.aggregateId, data: event.data },
          { subject: title, body, url: `/bons-de-travail/${event.aggregateId}` },
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to handle slaBreached event ${event.eventId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * B21 — client-portal work request: in-app + email fan-out to every
   * ADMIN and DISPATCHER so the request gets triaged quickly. The
   * configurable Alerts engine also sees the event (rules on
   * workOrders.workOrder.requested); this handler is the zero-config
   * default.
   */
  @OnEvent('workOrders.workOrder.requested', { async: true, promisify: true })
  async onWorkOrderRequested(event: WorkOrderEvent) {
    try {
      const data = event.data as {
        referenceNumber?: string;
        title?: string;
      };
      const recipients = await this.resolveSlaRecipients(null);
      if (recipients.length === 0) return;

      const title = '📥 Nouvelle demande de travail client';
      const body =
        `Un client a soumis la demande ${data.referenceNumber ?? ''} — « ${data.title ?? ''} ». ` +
        'Elle attend votre approbation.';

      for (const recipient of recipients) {
        await this.dispatchOne(
          recipient.id,
          'workOrder.requested',
          { title, body, aggregateId: event.aggregateId, data: event.data },
          { subject: title, body, url: `/bons-de-travail/${event.aggregateId}` },
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to handle requested event ${event.eventId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * B21 — portal invitation issued: send the set-password link to the
   * client. Plain email (the recipient has no account preferences yet).
   */
  @OnEvent('portal.invitation.issued', { async: true, promisify: true })
  async onPortalInvitationIssued(event: {
    email: string;
    link: string;
    clientName: string;
    tenantName?: string;
    locale?: string;
  }) {
    try {
      const en = event.locale === 'en';
      const subject = en
        ? `${event.tenantName ?? 'Dispatch2Go'} — your client portal access`
        : `${event.tenantName ?? 'Dispatch2Go'} — votre accès au portail client`;
      const text = en
        ? `Hello ${event.clientName},\n\nYou have been invited to the client portal. ` +
          `Set your password using the link below (valid 7 days):\n\n${event.link}\n\n` +
          `You will then be able to track your work orders, download completed reports ` +
          `and submit new work requests.`
        : `Bonjour ${event.clientName},\n\nVous avez été invité au portail client. ` +
          `Définissez votre mot de passe via le lien ci-dessous (valide 7 jours) :\n\n${event.link}\n\n` +
          `Vous pourrez ensuite suivre vos bons de travail, télécharger les rapports complétés ` +
          `et soumettre de nouvelles demandes de travail.`;
      await this.email.send({ to: event.email, subject, text });
    } catch (err) {
      this.logger.error(
        `Failed to send portal invitation email to ${event.email}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * SLA fan-out target list: the assigned tech (if any) + every ADMIN
   * and DISPATCHER. Deduped on id.
   */
  private async resolveSlaRecipients(assignedToId: string | null): Promise<Array<{ id: string }>> {
    const supervisors = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'DISPATCHER'] }, isActive: true },
      select: { id: true },
    });
    const set = new Set<string>(supervisors.map((u) => u.id));
    if (assignedToId) set.add(assignedToId);
    return Array.from(set).map((id) => ({ id }));
  }

  /**
   * Shared dispatch helper used by both the assigned and slaBreached
   * paths. Resolves the recipient's prefs, persists the in-app row,
   * fans out to enabled channels, marks sent.
   */
  private async dispatchOne(
    userId: string,
    eventType: 'workOrder.assigned' | 'workOrder.slaBreached' | 'workOrder.requested',
    notification: { title: string; body?: string; aggregateId?: string; data?: unknown },
    emailAndPush: { subject: string; body?: string; url?: string },
  ): Promise<void> {
    const prefs = await this.notifications.getPreferences(userId);
    const eventPrefs = prefs[eventType];

    const row = await this.notifications.create({
      userId,
      type: eventType,
      title: notification.title,
      body: notification.body,
      aggregateId: notification.aggregateId,
      data: notification.data,
    });

    const channels: string[] = [];
    if (eventPrefs.inApp) channels.push('in-app');
    if (eventPrefs.email) {
      const ok = await this.deliverEmail(userId, emailAndPush.subject, emailAndPush.body);
      if (ok) channels.push('email');
    }
    if (eventPrefs.push) {
      const ok = await this.push.send({
        userId,
        title: emailAndPush.subject,
        body: emailAndPush.body,
        url: emailAndPush.url,
      });
      if (ok) channels.push('push');
    }

    await this.notifications.markSent(row.id, channels);
  }

  /** Resolve recipient email + send. Returns true on success. */
  private async deliverEmail(userId: string, subject?: string, body?: string): Promise<boolean> {
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
      subject: subject ?? 'Nouveau bon de travail assigné',
      text:
        `Bonjour ${user.firstName ?? ''},\n\n` +
        (body ?? 'Un nouveau bon de travail vient de vous être assigné. Connectez-vous à TaskMgr pour le consulter.') +
        `\n\n— TaskMgr`,
    });
  }
}
