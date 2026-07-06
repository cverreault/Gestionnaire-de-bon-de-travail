import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SYSTEM_CONFIG_RESOLVER,
  type ISystemConfigResolver,
} from '../../../../common/contracts/system-config-resolver.contract';

/**
 * B10 (stub) → B22 (Twilio) — SMS channel.
 *
 * Provider selection is read from platform configs (`sms.provider`) so
 * the SA can flip the switch without redeploy:
 *   - unset      → stub: the outbound message is logged, nothing sent.
 *   - 'twilio'   → real send through the Twilio REST API. Credentials
 *                  come from `twilio.account-sid`, `twilio.auth-token`
 *                  (encrypted at rest) and `twilio.from-number` — all
 *                  editable in the SA platform-configuration screen,
 *                  with the usual env fallbacks (TWILIO_ACCOUNT_SID…).
 *
 * The Twilio call uses the native fetch (Node 20) — one endpoint,
 * form-encoded, Basic auth — so no SDK dependency is needed.
 * Contract: `send()` NEVER throws; failures are logged and return false
 * (alert/reminder dispatchers treat SMS as best-effort).
 */

export interface SendSmsInput {
  to: string;
  body: string;
}

const TWILIO_API = 'https://api.twilio.com/2010-04-01';

@Injectable()
export class SmsChannelService {
  private readonly logger = new Logger(SmsChannelService.name);

  constructor(
    @Inject(SYSTEM_CONFIG_RESOLVER)
    private readonly configs: ISystemConfigResolver,
  ) {}

  /** Returns true when the message was accepted (stub or provider). */
  async send(input: SendSmsInput): Promise<boolean> {
    try {
      const provider = await this.configs.resolve('sms.provider', 'SMS_PROVIDER');
      if (!provider) {
        // Stub default — log only.
        this.logger.log(
          `[SmsChannel STUB] to=${input.to} body="${truncate(input.body, 160)}"`,
        );
        return true;
      }

      if (provider.trim().toLowerCase() === 'twilio') {
        return await this.sendViaTwilio(input);
      }

      this.logger.warn(
        `[SmsChannel] provider="${provider}" is not supported (expected "twilio") — falling back to stub.`,
      );
      this.logger.log(
        `[SmsChannel STUB] to=${input.to} body="${truncate(input.body, 160)}"`,
      );
      return true;
    } catch (err) {
      // Belt-and-braces: the channel must never break a business flow.
      this.logger.error(
        `[SmsChannel] unexpected failure: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  private async sendViaTwilio(input: SendSmsInput): Promise<boolean> {
    const [accountSid, authToken, from] = await Promise.all([
      this.configs.resolve('twilio.account-sid', 'TWILIO_ACCOUNT_SID'),
      this.configs.resolve('twilio.auth-token', 'TWILIO_AUTH_TOKEN'),
      this.configs.resolve('twilio.from-number', 'TWILIO_FROM_NUMBER'),
    ]);

    if (!accountSid || !authToken || !from) {
      this.logger.warn(
        '[SmsChannel] provider=twilio but credentials are incomplete ' +
          '(twilio.account-sid / twilio.auth-token / twilio.from-number) — SMS not sent.',
      );
      return false;
    }

    const res = await fetch(
      `${TWILIO_API}/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: input.to,
          From: from,
          Body: input.body,
        }).toString(),
      },
    );

    if (!res.ok) {
      // Twilio returns a JSON error body with code + message.
      let detail = `HTTP ${res.status}`;
      try {
        const err = (await res.json()) as { code?: number; message?: string };
        detail = `HTTP ${res.status} — Twilio ${err.code ?? '?'}: ${err.message ?? 'unknown'}`;
      } catch {
        /* non-JSON error body — keep the HTTP status */
      }
      this.logger.error(`[SmsChannel] Twilio send failed for to=${input.to}: ${detail}`);
      return false;
    }

    const payload = (await res.json()) as { sid?: string; status?: string };
    this.logger.log(
      `[SmsChannel] Twilio accepted message sid=${payload.sid ?? '?'} status=${payload.status ?? '?'} to=${input.to}`,
    );
    return true;
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
