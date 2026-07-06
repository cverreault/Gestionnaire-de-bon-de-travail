import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from '../../notifications/application/notifications.service';
import { EmailChannelService } from '../../notifications/infrastructure/channels/email-channel.service';
import { SmsChannelService } from '../../notifications/infrastructure/channels/sms-channel.service';

/**
 * B15 — Cron sweeper that dispatches WO reminders.
 *
 * Every 5 minutes: pick pending rows whose `sendAt` has come due (limit
 * 100). For each row:
 *   • Render the message (custom template or default « Rappel : BT XYZ
 *     le 2026-07-15 à 14 h »).
 *   • Dispatch on every requested channel. `inApp` → NotificationsService
 *     for the assigned tech + the client's TaskMgr account (if any).
 *     `email` → EmailChannelService to the client's email. `sms` →
 *     SmsChannelService to the client's phone (stubbed in v1).
 *   • Mark the row `sent` or `failed`.
 *
 * Fire-and-forget: any per-channel error is logged, doesn't fail the row
 * (unless ALL requested channels failed).
 */
@Injectable()
export class RemindersDispatcher {
  private readonly logger = new Logger(RemindersDispatcher.name);
  private isSweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailChannelService,
    private readonly sms: SmsChannelService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    if (this.isSweeping) return;
    this.isSweeping = true;
    try {
      await this.runOnce();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Reminder sweep failed: ${message}`);
    } finally {
      this.isSweeping = false;
    }
  }

  async runOnce(): Promise<{ processed: number }> {
    const now = new Date();
    // Raw SQL to bypass tenant scoping — we're sweeping every tenant.
    type Row = {
      id: string;
      tenant_id: string;
      work_order_id: string;
      channels: string[];
      body_template: string | null;
    };
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `UPDATE wo_reminders
          SET status = 'dispatching'
        WHERE id IN (
          SELECT id FROM wo_reminders
           WHERE status = 'pending' AND send_at <= $1
           ORDER BY send_at
           LIMIT 100
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, tenant_id, work_order_id, channels, body_template`,
      now,
    );

    if (rows.length === 0) return { processed: 0 };

    for (const row of rows) {
      try {
        await this.dispatchOne(row);
        await this.prisma.$executeRawUnsafe(
          `UPDATE wo_reminders SET status = 'sent', sent_at = NOW(), error_message = NULL WHERE id = $1`,
          row.id,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Reminder ${row.id} failed: ${message}`);
        await this.prisma.$executeRawUnsafe(
          `UPDATE wo_reminders SET status = 'failed', error_message = $2 WHERE id = $1`,
          row.id,
          message.slice(0, 512),
        );
      }
    }
    return { processed: rows.length };
  }

  private async dispatchOne(row: {
    id: string;
    tenant_id: string;
    work_order_id: string;
    channels: string[];
    body_template: string | null;
  }): Promise<void> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: row.work_order_id },
      select: {
        id: true,
        referenceNumber: true,
        title: true,
        scheduledDate: true,
        assignedToId: true,
        assignedTo: { select: { firstName: true, lastName: true } },
        client: { select: { email: true, phone: true, firstName: true, lastName: true, companyName: true } },
      },
    });
    if (!wo) throw new Error('Bon de travail introuvable au moment du dispatch');

    const message = row.body_template
      ? this.render(row.body_template, wo)
      : this.defaultMessage(wo);
    const title = `Rappel BT ${wo.referenceNumber}`;

    let atLeastOneSucceeded = false;
    const errors: string[] = [];

    if (row.channels.includes('inApp') && wo.assignedToId) {
      try {
        await this.notifications.create({
          userId: wo.assignedToId,
          type: 'workOrders.workOrder.reminder',
          title,
          body: message,
          aggregateId: wo.id,
        });
        atLeastOneSucceeded = true;
      } catch (e) {
        errors.push(`inApp: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (row.channels.includes('email') && wo.client?.email) {
      try {
        const ok = await this.email.send({
          to: wo.client.email,
          subject: title,
          text: message,
        });
        if (ok) atLeastOneSucceeded = true;
        else errors.push('email: adapter returned false');
      } catch (e) {
        errors.push(`email: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (row.channels.includes('sms') && wo.client?.phone) {
      try {
        const ok = await this.sms.send({
          to: wo.client.phone,
          body: message,
        });
        if (ok) atLeastOneSucceeded = true;
        else errors.push('sms: adapter returned false');
      } catch (e) {
        errors.push(`sms: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (!atLeastOneSucceeded) {
      throw new Error(
        errors.length > 0
          ? errors.join(' | ')
          : 'Aucun canal disponible pour ce rappel (destinataires manquants ?)',
      );
    }
  }

  private defaultMessage(wo: {
    referenceNumber: string;
    title: string;
    scheduledDate: Date | null;
    client: { firstName: string | null; lastName: string | null; companyName: string | null } | null;
  }): string {
    const when = wo.scheduledDate
      ? wo.scheduledDate.toLocaleString('fr-CA', {
          dateStyle: 'full',
          timeStyle: 'short',
        })
      : 'à venir';
    const clientLabel = wo.client
      ? wo.client.companyName ||
        `${wo.client.firstName ?? ''} ${wo.client.lastName ?? ''}`.trim()
      : '';
    const salutation = clientLabel ? `Bonjour ${clientLabel},\n\n` : 'Bonjour,\n\n';
    return `${salutation}Rappel : votre rendez-vous « ${wo.title} » (${wo.referenceNumber}) est prévu ${when}.\n\nSi cette date ne vous convient plus, contactez-nous pour la modifier.\n\nMerci !`;
  }

  private render(
    template: string,
    ctx: {
      referenceNumber: string;
      title: string;
      scheduledDate: Date | null;
      assignedTo: { firstName: string | null; lastName: string | null } | null;
      client: { firstName: string | null; lastName: string | null; companyName: string | null } | null;
    },
  ): string {
    return template
      .replace(/\{\{\s*workOrder\.referenceNumber\s*\}\}/g, ctx.referenceNumber)
      .replace(/\{\{\s*workOrder\.title\s*\}\}/g, ctx.title)
      .replace(
        /\{\{\s*workOrder\.scheduledDate\s*\}\}/g,
        ctx.scheduledDate
          ? ctx.scheduledDate.toLocaleString('fr-CA', {
              dateStyle: 'full',
              timeStyle: 'short',
            })
          : '',
      )
      .replace(
        /\{\{\s*technician\.name\s*\}\}/g,
        ctx.assignedTo
          ? `${ctx.assignedTo.firstName ?? ''} ${ctx.assignedTo.lastName ?? ''}`.trim()
          : '',
      )
      .replace(
        /\{\{\s*client\.name\s*\}\}/g,
        ctx.client
          ? ctx.client.companyName ||
              `${ctx.client.firstName ?? ''} ${ctx.client.lastName ?? ''}`.trim()
          : '',
      );
  }
}
