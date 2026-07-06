import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SYSTEM_CONFIG_RESOLVER,
  type ISystemConfigResolver,
} from '../../../../common/contracts/system-config-resolver.contract';

/**
 * B10 — SMS channel stub.
 *
 * v1 ships the wire (checkbox in the UI + storage on `alert_rules.channels`
 * + this adapter) but does NOT actually send. When someone enables SMS on
 * an alert, the dispatcher calls `send()` and we log the outbound message
 * to the console — nothing crosses the wire.
 *
 * v1.1 will drop in a Twilio (or configurable) adapter without touching
 * any caller: the shape here matches EmailChannelService exactly, and the
 * DB schema already stores everything a real provider needs.
 *
 * Provider selection is read from `SystemConfigService` (`sms.provider`)
 * so the SA can flip a switch when v1.1 lands — no redeploy needed.
 */

export interface SendSmsInput {
  to: string;
  body: string;
}

@Injectable()
export class SmsChannelService {
  private readonly logger = new Logger(SmsChannelService.name);

  constructor(
    @Inject(SYSTEM_CONFIG_RESOLVER)
    private readonly configs: ISystemConfigResolver,
  ) {}

  /** Returns true on stub-success (v1) or provider-success (v1.1). Never throws. */
  async send(input: SendSmsInput): Promise<boolean> {
    const provider = await this.configs.resolve('sms.provider', 'SMS_PROVIDER');
    if (!provider) {
      // v1 default — log only.
      this.logger.log(
        `[SmsChannel STUB] to=${input.to} body="${truncate(input.body, 160)}"`,
      );
      return true;
    }
    // v1.1 hook: dispatch on `provider` (e.g. 'twilio') and delegate to
    // an injected adapter. For v1 we still stub even if the SA sets a
    // provider — flag it so the operator knows their config isn't live yet.
    this.logger.warn(
      `[SmsChannel] provider="${provider}" is configured but the adapter is not wired in v1 — falling back to stub.`,
    );
    this.logger.log(
      `[SmsChannel STUB] to=${input.to} body="${truncate(input.body, 160)}"`,
    );
    return true;
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
