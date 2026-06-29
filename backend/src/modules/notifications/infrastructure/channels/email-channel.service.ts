import { Inject, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  ISystemConfigResolver,
  SYSTEM_CONFIG_RESOLVER,
} from '../../../../common/contracts/system-config-resolver.contract';

/**
 * Email delivery channel for notifications (B1.1.c, refactored in SA.2.a).
 *
 * Two operating modes:
 *
 * 1. **SMTP mode** — when `smtp.host` resolves to a value (DB > env),
 *    build a nodemailer transport using `smtp.port` (default 587),
 *    `smtp.user` and `smtp.pass` for AUTH, and `smtp.secure=true|false`
 *    (default false to match STARTTLS on 587). FROM address comes from
 *    `notifications.from` ("TaskMgr <noreply@localhost>" by default).
 *
 * 2. **Console mode** — when `smtp.host` is absent, log the email
 *    payload to Pino instead of sending. No deps on Mailhog / Mailpit.
 *
 * Configuration source (since SA.2.a)
 * - All values flow through SystemConfigService.resolve(): a SUPER_ADMIN
 *   can override SMTP creds from the UI without touching .env. The env
 *   var fallback keeps existing deployments working.
 * - Resolved on every send() call. nodemailer's createTransport is cheap
 *   (no connection — that happens during sendMail) so this isn't a
 *   perf concern at notification volumes.
 *
 * The channel never throws on send — failures are caught and returned
 * as a boolean so the orchestrator can mark `FAILED` without bringing
 * down the listener.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class EmailChannelService {
  private readonly logger = new Logger(EmailChannelService.name);

  constructor(
    @Inject(SYSTEM_CONFIG_RESOLVER)
    private readonly configs: ISystemConfigResolver,
  ) {}

  /** Returns true on success, false on failure. Never throws. */
  async send(input: SendEmailInput): Promise<boolean> {
    const host = await this.configs.resolve('smtp.host', 'SMTP_HOST');
    if (!host) {
      this.logger.log(
        `[CONSOLE EMAIL] to=${input.to} subject="${input.subject}"\n${input.text}`,
      );
      return true;
    }

    try {
      const transporter = await this.buildTransporter(host);
      const from = (await this.configs.resolve('notifications.from', 'NOTIFICATIONS_FROM'))
        ?? 'TaskMgr <noreply@localhost>';
      await transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      this.logger.log(`✉️  Email sent to ${input.to}: ${input.subject}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Email send failed (to=${input.to}): ${message}`);
      return false;
    }
  }

  private async buildTransporter(host: string): Promise<nodemailer.Transporter> {
    const port = parseInt(
      (await this.configs.resolve('smtp.port', 'SMTP_PORT')) ?? '587',
      10,
    );
    const secure = (await this.configs.resolve('smtp.secure', 'SMTP_SECURE')) === 'true';
    const user = await this.configs.resolve('smtp.user', 'SMTP_USER');
    const pass = await this.configs.resolve('smtp.pass', 'SMTP_PASS');

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user || pass ? { user: user ?? '', pass: pass ?? '' } : undefined,
    });
  }
}
