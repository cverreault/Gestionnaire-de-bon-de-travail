import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../../../../common/prisma/prisma.service';

/**
 * Web Push channel (B1.3).
 *
 * Configuration model
 * - VAPID keys come from VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in the env.
 * - VAPID_SUBJECT (default mailto:noreply@taskmgr.local) tells push
 *   services who to contact about abuse.
 * - When VAPID_PUBLIC_KEY is absent the channel goes into DISABLED mode:
 *   subscribe/send become no-ops and a warning is logged at startup,
 *   identical posture to the email channel without SMTP_HOST.
 *
 * How to provision keys
 *   npx web-push generate-vapid-keys
 *   then paste publicKey + privateKey into the env.
 *
 * The PUBLIC key is also returned via GET /me/notifications/push/vapid-public-key
 * so the frontend service worker can call PushManager.subscribe() with it.
 *
 * Subscription lifecycle
 * - On subscribe() we upsert by endpoint (browser is the unique source
 *   of truth — re-subscribing the same browser replaces the row).
 * - On 404 / 410 from a push service during send() we delete the
 *   subscription — the browser unsubscribed and reusing it forever
 *   would just burn CPU.
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
  private readonly publicKey: string | undefined;
  private readonly privateKey: string | undefined;
  private readonly subject: string;
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    this.privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    this.subject = config.get<string>('VAPID_SUBJECT') ?? 'mailto:noreply@taskmgr.local';
  }

  onModuleInit() {
    if (this.publicKey && this.privateKey) {
      webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
      this.enabled = true;
      this.logger.log(`🔔 Web Push enabled (subject=${this.subject})`);
    } else {
      this.logger.warn(
        '🔕 Web Push DISABLED: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing. ' +
        'Generate keys with `npx web-push generate-vapid-keys`.',
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
        // Touch lastUsedAt so a future GC sweep can prune long-stale subs.
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
