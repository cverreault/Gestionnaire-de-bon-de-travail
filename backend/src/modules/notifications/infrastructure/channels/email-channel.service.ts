import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Email delivery channel for notifications (B1.1.c).
 *
 * Two operating modes:
 *
 * 1. **SMTP mode** — when SMTP_HOST is set in the env, lazily build a
 *    nodemailer transport using SMTP_PORT (default 587), SMTP_USER and
 *    SMTP_PASS for AUTH, and SMTP_SECURE=true|false (default false to
 *    match STARTTLS on 587). FROM address comes from
 *    NOTIFICATIONS_FROM ("TaskMgr <noreply@localhost>" by default).
 *
 * 2. **Console mode** — when SMTP_HOST is absent (typical local dev),
 *    log the email payload to Pino instead of sending. No deps on
 *    Mailhog / Mailpit; the operator just reads the backend log.
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
  private transporter: nodemailer.Transporter | null = null;
  private readonly from: string;
  private readonly smtpConfigured: boolean;

  constructor(private readonly config: ConfigService) {
    this.from = config.get<string>('NOTIFICATIONS_FROM') ?? 'TaskMgr <noreply@localhost>';
    this.smtpConfigured = !!config.get<string>('SMTP_HOST');

    if (!this.smtpConfigured) {
      this.logger.warn(
        '📭 Email channel in CONSOLE mode: SMTP_HOST not set, emails will be logged only. ' +
        'Set SMTP_HOST, SMTP_USER, SMTP_PASS to enable delivery.',
      );
    }
  }

  /** Returns true on success, false on failure. Never throws. */
  async send(input: SendEmailInput): Promise<boolean> {
    if (!this.smtpConfigured) {
      this.logger.log(
        `[CONSOLE EMAIL] to=${input.to} subject="${input.subject}"\n${input.text}`,
      );
      return true;
    }

    try {
      if (!this.transporter) this.transporter = this.buildTransporter();
      await this.transporter.sendMail({
        from: this.from,
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

  private buildTransporter(): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: parseInt(this.config.get<string>('SMTP_PORT') ?? '587', 10),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth:
        this.config.get<string>('SMTP_USER') || this.config.get<string>('SMTP_PASS')
          ? {
              user: this.config.get<string>('SMTP_USER') ?? '',
              pass: this.config.get<string>('SMTP_PASS') ?? '',
            }
          : undefined,
    });
  }
}
