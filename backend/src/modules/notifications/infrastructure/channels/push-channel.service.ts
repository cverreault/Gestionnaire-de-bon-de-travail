import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as webpush from 'web-push';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  ISystemConfigResolver,
  SYSTEM_CONFIG_RESOLVER,
  SYSTEM_CONFIG_CHANGED_EVENT,
} from '../../../../common/contracts/system-config-resolver.contract';

/**
 * Web Push channel (B1.3, refactored in SA.2.a).
 *
 * Configuration source (since SA.2.a)
 * - VAPID keys resolve through SystemConfigService.resolve(): DB rows
 *   (set by SA via UI) take precedence over env vars. Falls back to
 *   DISABLED when neither source has both keys.
 * - Loaded once at boot (onApplicationBootstrap) and re-loadable via
 *   refreshConfig() — the SA controller calls that after a successful
 *   PUT on a vapid.* key so the change picks up without a restart.
 *
 * The rest of the original behaviour is unchanged:
 * - On 404 / 410 from a push service we delete the subscription.
 * - send() in DISABLED mode logs to Pino and treats itself as success.
 */

export interface PushSubscribeInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export interface PushSendInput {
  userId: string;
  title: string;
  body?: string;
  url?: string;
}

@Injectable()
export class PushChannelService implements OnModuleInit {
  private readonly logger = new Logger(PushChannelService.name);
  private publicKey: string | undefined;
  private privateKey: string | undefined;
  private subject = 'mailto:noreply@taskmgr.local';
  private enabled = false;

  constructor(
    @Inject(SYSTEM_CONFIG_RESOLVER)
    private readonly configs: ISystemConfigResolver,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.refreshConfig();
  }

  /**
   * React to live config updates from the SA UI. Re-loads when the
   * mutated key starts with `vapid.` — other keys don't affect us.
   */
  @OnEvent(SYSTEM_CONFIG_CHANGED_EVENT, { async: true, promisify: true })
  async onConfigChanged(event: { aggregateId: string }) {
    if (event.aggregateId.startsWith('vapid.')) {
      this.logger.log(`🔄 VAPID config changed (${event.aggregateId}) — reloading`);
      await this.refreshConfig();
    }
  }

  /**
   * Re-reads VAPID config from SystemConfigService and re-registers with
   * web-push. Called once at boot, and again whenever the SA writes a
   * vapid.* key from the UI.
   */
  async refreshConfig(): Promise<void> {
    this.publicKey = await this.configs.resolve('vapid.public-key', 'VAPID_PUBLIC_KEY');
    this.privateKey = await this.configs.resolve('vapid.private-key', 'VAPID_PRIVATE_KEY');
    this.subject = (await this.configs.resolve('vapid.subject', 'VAPID_SUBJECT'))
      ?? 'mailto:noreply@taskmgr.local';

    if (this.publicKey && this.privateKey) {
      webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
      this.enabled = true;
      this.logger.log(`🔔 Web Push enabled (subject=${this.subject})`);
    } else {
      this.enabled = false;
      this.logger.warn(
        '🔕 Web Push DISABLED: vapid.public-key / vapid.private-key missing. ' +
        'Generate keys with `npx web-push generate-vapid-keys` and set them via SA UI or env.',
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getPublicKey(): string | null {
    return this.enabled ? this.publicKey ?? null : null;
  }

  // ── Subscription lifecycle ────────────────────────────────────────────────

  async subscribe(input: PushSubscribeInput) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
      update: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { removed: result.count };
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  /** Returns true if at least one subscription was reached successfully. */
  async send(input: PushSendInput): Promise<boolean> {
    if (!this.enabled) {
      this.logger.log(
        `[CONSOLE PUSH] userId=${input.userId} title="${input.title}"` +
        (input.body ? ` body="${input.body}"` : ''),
      );
      return true; // treat as success in CONSOLE mode for parity with email
    }

    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: input.userId },
    });
    if (subs.length === 0) {
      this.logger.debug(`No push subscriptions for user=${input.userId}`);
      return false;
    }

    const payload = JSON.stringify({
      title: input.title,
      body: input.body ?? '',
      url: input.url ?? '/',
    });

    let successCount = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        successCount++;
        await this.prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          this.logger.log(
            `Push subscription gone (${status}), deleting endpoint=${sub.endpoint.slice(0, 40)}…`,
          );
          await this.prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => undefined);
        } else {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`Push send failed: ${message}`);
        }
      }
    }

    return successCount > 0;
  }
}
