import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SYSTEM_CONFIG_RESOLVER,
  type ISystemConfigResolver,
} from '../../../common/contracts/system-config-resolver.contract';
import { OnEvent } from '@nestjs/event-emitter';
import type { IDomainEvent } from '../../../common/contracts/domain-event.interface';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { EmailChannelService } from '../infrastructure/channels/email-channel.service';
import { PushChannelService } from '../infrastructure/channels/push-channel.service';
import { SmsChannelService } from '../infrastructure/channels/sms-channel.service';

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

interface SecurityRecipient {
  email: string;
  phone: string | null;
  firstName: string;
  locale: 'fr' | 'en';
}

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly email: EmailChannelService,
    private readonly push: PushChannelService,
    private readonly prisma: PrismaService,
    @Inject(SYSTEM_CONFIG_RESOLVER)
    private readonly configs: ISystemConfigResolver,
    private readonly sms: SmsChannelService,
  ) {}

  /**
   * B39 — a platform SUPER_ADMIN's password was set by another SA.
   * Security notice on both channels (email + SMS when a phone is on file)
   * so the affected person learns about it even if their session was
   * just revoked. Recipient data travels in the event (no lookup).
   */
  @OnEvent('platform.super_admin.password_reset', { async: true, promisify: true })
  async onSuperAdminPasswordReset(event: { data?: { recipient?: SecurityRecipient } }) {
    const r = event.data?.recipient;
    if (!r) return;
    const en = r.locale === 'en';
    await this.sendSecurityNotice(r, {
      subject: en
        ? 'Dispatch2Go — your password was changed'
        : 'Dispatch2Go — votre mot de passe a été modifié',
      text: en
        ? `Hello ${r.firstName},\n\nA platform administrator has just set a new password on your Dispatch2Go account. ` +
          `Your open sessions have been closed.\n\nIf you did not expect this, contact the platform owner immediately.`
        : `Bonjour ${r.firstName},\n\nUn administrateur de la plateforme vient de définir un nouveau mot de passe sur votre compte Dispatch2Go. ` +
          `Vos sessions ouvertes ont été fermées.\n\nSi vous n'attendiez pas ce changement, contactez le responsable de la plateforme immédiatement.`,
      sms: en
        ? 'Dispatch2Go: your password was just changed by a platform administrator. Contact the platform owner if unexpected.'
        : "Dispatch2Go : votre mot de passe vient d'être modifié par un administrateur de la plateforme. Contactez le responsable si ce n'est pas attendu.",
    });
  }

  /** B39 — 2FA disabled by another SA: same security notice. */
  @OnEvent('platform.super_admin.totp_reset', { async: true, promisify: true })
  async onSuperAdminTotpReset(event: { data?: { recipient?: SecurityRecipient } }) {
    const r = event.data?.recipient;
    if (!r) return;
    const en = r.locale === 'en';
    await this.sendSecurityNotice(r, {
      subject: en
        ? 'Dispatch2Go — two-factor authentication disabled'
        : 'Dispatch2Go — double authentification désactivée',
      text: en
        ? `Hello ${r.firstName},\n\nA platform administrator has disabled two-factor authentication on your Dispatch2Go account. ` +
          `You can set it up again from your profile.\n\nIf you did not expect this, contact the platform owner immediately.`
        : `Bonjour ${r.firstName},\n\nUn administrateur de la plateforme a désactivé la double authentification sur votre compte Dispatch2Go. ` +
          `Vous pouvez la reconfigurer depuis votre profil.\n\nSi vous n'attendiez pas ce changement, contactez le responsable de la plateforme immédiatement.`,
      sms: en
        ? 'Dispatch2Go: 2FA was just disabled on your account by a platform administrator. Contact the platform owner if unexpected.'
        : "Dispatch2Go : la 2FA vient d'être désactivée sur votre compte par un administrateur. Contactez le responsable si ce n'est pas attendu.",
    });
  }

  private async sendSecurityNotice(
    r: SecurityRecipient,
    msg: { subject: string; text: string; sms: string },
  ): Promise<void> {
    try {
      await this.email.send({ to: r.email, subject: msg.subject, text: msg.text });
      if (r.phone) {
        await this.sms.send({ to: r.phone, body: msg.sms });
      }
    } catch (err) {
      this.logger.error(
        `Failed to send security notice to ${r.email}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

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
   * B23 — keep the CLIENT in the loop by email at the three moments that
   * matter to them (zero-config, bilingual FR/EN since the client record
   * has no locale):
   *   - request approved   (isRequested step → isInitial step)
   *   - request rejected   (isRequested step → isTerminalNegative step)
   *   - work order completed positively — the PDF report is now
   *     downloadable on the portal (only sent when the client actually
   *     has an active portal account, otherwise the link is a dead end).
   */
  @OnEvent('workOrders.workOrder.statusChanged', { async: true, promisify: true })
  async onWorkOrderStatusChangedClientEmail(event: WorkOrderEvent) {
    try {
      const data = event.data as unknown as {
        fromStatusId: string | null;
        toStatusId: string;
      };
      if (!data.toStatusId) return;

      const wo = await this.prisma.workOrder.findUnique({
        where: { id: event.aggregateId },
        select: {
          referenceNumber: true,
          title: true,
          negativeReason: true,
          scheduledDate: true,
          client: {
            select: {
              email: true,
              firstName: true,
              portalUsers: { where: { isActive: true }, select: { id: true } },
            },
          },
        },
      });
      if (!wo?.client?.email) return;

      const [from, to] = await Promise.all([
        data.fromStatusId
          ? this.prisma.processStatus.findUnique({
              where: { id: data.fromStatusId },
              select: { isRequested: true },
            })
          : Promise.resolve(null),
        this.prisma.processStatus.findUnique({
          where: { id: data.toStatusId },
          select: { isInitial: true, isTerminalPositive: true, isTerminalNegative: true },
        }),
      ]);
      if (!to) return;

      const origin =
        (await this.configs.resolve('platform.origin', 'PLATFORM_ORIGIN')) ??
        'http://localhost:8088';
      const portalLink = `${origin}/portail`;
      const ref = wo.referenceNumber;
      const hello = `Bonjour ${wo.client.firstName},\n\n`;

      if (from?.isRequested && to.isInitial) {
        await this.email.send({
          to: wo.client.email,
          subject: `Demande ${ref} approuvée / Request approved`,
          text:
            hello +
            `Votre demande de travail ${ref} — « ${wo.title} » a été approuvée. ` +
            `Nous vous contacterons pour la planification ; suivez son avancement sur le portail : ${portalLink}\n\n` +
            `— Your work request ${ref} — "${wo.title}" has been approved. ` +
            `We will contact you for scheduling; track its progress on the portal: ${portalLink}`,
        });
        return;
      }

      if (from?.isRequested && to.isTerminalNegative) {
        const reason = wo.negativeReason ? `\nMotif / Reason : ${wo.negativeReason}` : '';
        await this.email.send({
          to: wo.client.email,
          subject: `Demande ${ref} refusée / Request declined`,
          text:
            hello +
            `Votre demande de travail ${ref} — « ${wo.title} » n'a pas été retenue.${reason}\n` +
            `Pour toute question, répondez à ce courriel ou contactez votre fournisseur.\n\n` +
            `— Your work request ${ref} — "${wo.title}" was declined.${reason}`,
        });
        return;
      }

      // Completion emails (client + company) moved to onWorkOrderCompleted (B48).
    } catch (err) {
      this.logger.error(
        `Failed client email for statusChanged ${event.eventId}: ${
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
   * B24 — warehouse stock crossed a part's minimum threshold: in-app +
   * email to every ADMIN and DISPATCHER. Emitted once per crossing by
   * StockService, so no dedup needed here.
   */
  @OnEvent('inventory.stock.low', { async: true, promisify: true })
  async onInventoryStockLow(event: {
    partId: string;
    sku: string;
    name: string;
    quantity: number;
    minStock: number;
  }) {
    try {
      const recipients = await this.resolveSlaRecipients(null);
      if (recipients.length === 0) return;
      const title = '📦 Stock bas';
      const body =
        `La pièce ${event.sku} — « ${event.name} » est passée sous son seuil : ` +
        `${event.quantity} restante(s) (seuil ${event.minStock}). Pensez à commander.`;
      for (const recipient of recipients) {
        await this.dispatchOne(
          recipient.id,
          'inventory.lowStock',
          { title, body, aggregateId: event.partId, data: event },
          { subject: title, body, url: '/inventaire' },
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to handle inventory.stock.low: ${
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
    eventType: 'workOrder.assigned' | 'workOrder.slaBreached' | 'workOrder.requested' | 'inventory.lowStock',
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

  /**
   * B48 — every completed job (positive or negative) :
   *   - a summary to the company's « travaux complétés » address (Paramètres → Entreprise) ;
   *   - a client email when the client opted in (« courriel à la fin des travaux »)
   *     or has an active portal account (report downloadable there).
   */
  @OnEvent('workOrders.workOrder.completed', { async: true, promisify: true })
  async onWorkOrderCompleted(event: WorkOrderEvent) {
    try {
      const data = event.data as unknown as { outcome: 'positive' | 'negative' };
      const wo = await this.prisma.workOrder.findUnique({
        where: { id: event.aggregateId },
        select: {
          id: true,
          tenantId: true,
          referenceNumber: true,
          title: true,
          description: true,
          completionNotes: true,
          negativeReason: true,
          actualStartTime: true,
          actualEndTime: true,
          scheduledDate: true,
          signatureClient: true,
          signatureTechnician: true,
          clientAddress: true,
          assignedTo: { select: { firstName: true, lastName: true } },
          client: {
            select: {
              firstName: true,
              lastName: true,
              companyName: true,
              email: true,
              notificationEmails: true,
              portalUsers: { where: { isActive: true }, select: { id: true } },
            },
          },
          clientAddress_rel: { select: { streetNumber: true, street: true, apartment: true, city: true, postalCode: true } },
          partsUsed: { select: { quantity: true, part: { select: { sku: true, name: true } } } },
          tenant: { select: { name: true, completedJobsEmail: true } },
        },
      });
      if (!wo) return;

      const origin = (await this.configs.resolve('platform.origin', 'PLATFORM_ORIGIN')) ?? 'http://localhost:8088';
      const ref = wo.referenceNumber;
      const positive = data.outcome === 'positive';
      const outcomeFr = positive ? 'complété' : 'terminé en échec';
      const a = wo.clientAddress_rel;
      const address = a
        ? [[a.streetNumber, a.street].filter(Boolean).join(' '), a.apartment ? `app. ${a.apartment}` : null, a.city, a.postalCode].filter(Boolean).join(', ')
        : wo.clientAddress ?? '';
      const clientName = wo.client ? wo.client.companyName || `${wo.client.firstName} ${wo.client.lastName}` : '';
      const tech = wo.assignedTo ? `${wo.assignedTo.firstName} ${wo.assignedTo.lastName}` : '—';
      const fmt = (d: Date | null) => (d ? d.toLocaleString('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }) : '—');
      const parts = wo.partsUsed.map((p) => `${p.quantity} × ${p.part.sku} ${p.part.name}`).join('\n  ');
      const signatures = [wo.signatureClient ? 'client' : null, wo.signatureTechnician ? 'technicien' : null].filter(Boolean).join(', ') || 'aucune';

      // 1. Company summary
      const companyTo = wo.tenant?.completedJobsEmail?.trim();
      if (companyTo) {
        await this.email.send({
          to: companyTo,
          subject: `[${wo.tenant?.name ?? 'Dispatch2Go'}] Travail ${ref} ${outcomeFr} — ${wo.title}`,
          text:
            `Bon de travail ${ref} ${outcomeFr}.\n\n` +
            `Titre : ${wo.title}\n` +
            (clientName ? `Client : ${clientName}\n` : '') +
            (address ? `Adresse : ${address}\n` : '') +
            `Technicien : ${tech}\n` +
            `Début : ${fmt(wo.actualStartTime)}\nFin : ${fmt(wo.actualEndTime)}\n` +
            `Signatures : ${signatures}\n` +
            (wo.completionNotes ? `\nNotes de fin de travaux :\n${wo.completionNotes}\n` : '') +
            (wo.negativeReason ? `\nMotif d'échec :\n${wo.negativeReason}\n` : '') +
            (parts ? `\nPièces utilisées :\n  ${parts}\n` : '') +
            `\nVoir le bon de travail : ${origin}/bons-de-travail/${wo.id}\n`,
        });
      }

      // 2. Client
      const client = wo.client;
      // B48.2 — the client's notification list ; a portal account falls back to the main email.
      const recipients = [...new Set([...(client?.notificationEmails ?? []), ...(client && client.portalUsers.length > 0 && client.email ? [client.email] : [])].map((e) => e.trim().toLowerCase()).filter(Boolean))];
      if (client && recipients.length > 0) {
        const hello = `Bonjour ${client.firstName},\n\n`;
        const portal = client.portalUsers.length > 0 ? `\nLe rapport d'intervention (PDF) est disponible sur le portail : ${origin}/portail\n` : '';
        await this.email.send({
          to: recipients.join(', '),
          subject: positive ? `Travail ${ref} complété / Work completed` : `Travail ${ref} — intervention non complétée / Work not completed`,
          text: positive
            ? hello +
              `Le bon de travail ${ref} — « ${wo.title} » est complété` + (address ? ` au ${address}` : '') + `.\n` +
              (wo.completionNotes ? `\nNotes du technicien :\n${wo.completionNotes}\n` : '') +
              portal +
              `\n— Work order ${ref} — "${wo.title}" is complete.` + (client.portalUsers.length > 0 ? ` The intervention report (PDF) is available on the portal: ${origin}/portail` : '')
            : hello +
              `L'intervention ${ref} — « ${wo.title} » n'a pas pu être complétée.` + (wo.negativeReason ? `\nMotif : ${wo.negativeReason}` : '') +
              `\nNous vous recontacterons pour la suite.\n\n` +
              `— Work order ${ref} — "${wo.title}" could not be completed.` + (wo.negativeReason ? ` Reason: ${wo.negativeReason}` : ''),
        });
      }
    } catch (err) {
      this.logger.error(`Failed completion emails for ${event.eventId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
