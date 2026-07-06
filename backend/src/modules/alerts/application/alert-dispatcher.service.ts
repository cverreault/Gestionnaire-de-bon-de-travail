import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../../notifications/application/notifications.service';
import { EmailChannelService } from '../../notifications/infrastructure/channels/email-channel.service';
import { PushChannelService } from '../../notifications/infrastructure/channels/push-channel.service';
import { SmsChannelService } from '../../notifications/infrastructure/channels/sms-channel.service';
import { TemplateRendererService } from './template-renderer.service';
import type { AlertRuleRow } from './alerts.service';
import type { ResolvedTargets } from './recipient-resolver.service';

/**
 * B10 — Fan out one rule's resolved targets to their channels.
 *
 * ─ Internal targets ─
 *   Delegate to NotificationsService.create() so the inbox row and
 *   per-user prefs stay owned by the notifications module. That path
 *   handles push + email automatically for the user based on their
 *   preferences. We DO NOT double-dispatch email/push here for internal
 *   users — that would violate per-user opt-out.
 *
 * ─ External targets ─
 *   Bypass the inbox (the client has no TaskMgr account). Call
 *   EmailChannelService / SmsChannelService directly with the
 *   client-facing template rendering (which never leaks internal state).
 *
 * Every send() call is wrapped: a failing receiver must never break the
 * business transition that fired the event.
 */
@Injectable()
export class AlertDispatcherService {
  private readonly logger = new Logger(AlertDispatcherService.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly email: EmailChannelService,
    private readonly sms: SmsChannelService,
    private readonly push: PushChannelService,
    private readonly renderer: TemplateRendererService,
  ) {}

  async dispatch(
    rule: AlertRuleRow,
    targets: ResolvedTargets,
    context: DispatchContext,
  ): Promise<void> {
    // ── Internal ────────────────────────────────────────────────
    const internalTitle = this.renderer.render(rule.titleTemplate, context);
    const internalBody = this.renderer.render(rule.bodyTemplate, context);

    for (const target of targets.internal) {
      try {
        await this.notifications.create({
          userId: target.userId,
          type: rule.eventName,
          title: internalTitle,
          body: internalBody,
          aggregateId: context.workOrder?.id ?? undefined,
          data: {
            alertRuleId: rule.id,
            alertRuleName: rule.name,
            eventName: rule.eventName,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Alert ${rule.id} → internal user ${target.userId} failed: ${message}`,
        );
      }
    }

    // ── External ────────────────────────────────────────────────
    // Distinct client-facing template pair — mandatory when recipientClient
    // is true (enforced in AlertsService.validate). Fall back to the
    // internal templates only if the constraint was somehow bypassed.
    const clientTitle = this.renderer.render(
      rule.clientTitleTemplate ?? rule.titleTemplate,
      context,
    );
    const clientBody = this.renderer.render(
      rule.clientBodyTemplate ?? rule.bodyTemplate,
      context,
    );

    for (const target of targets.external) {
      for (const channel of target.channels) {
        try {
          if (channel === 'email' && target.externalEmail) {
            await this.email.send({
              to: target.externalEmail,
              subject: clientTitle,
              text: clientBody,
            });
          } else if (channel === 'sms' && target.externalPhone) {
            await this.sms.send({
              to: target.externalPhone,
              body: `${clientTitle}\n\n${clientBody}`,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Alert ${rule.id} → ${target.label} (${channel}) failed: ${message}`,
          );
        }
      }
    }
  }
}

// ─── Types ─────────────────────────────────────────────────────────

export interface DispatchContext {
  workOrder?: {
    id: string;
    referenceNumber?: string;
    title?: string;
    priority?: number | string | null;
    negativeReason?: string | null;
  };
  transition?: {
    from?: string | null;
    to?: string | null;
    fromLabel?: string | null;
    toLabel?: string | null;
  };
  technician?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  };
  client?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  };
  tenant?: {
    id: string;
    name?: string | null;
  };
}
