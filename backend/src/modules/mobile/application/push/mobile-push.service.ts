import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  SYSTEM_CONFIG_RESOLVER,
  type ISystemConfigResolver,
} from '../../../../common/contracts/system-config-resolver.contract';
import type { IMobilePushSender, MobilePushInput } from '../../../../common/contracts/mobile-push.contract';
import { ExpoPushAdapter } from '../../infrastructure/expo-push.adapter';

/** A device unseen for longer than this is not worth a push (ADR-015 §3). */
export const ACTIVE_DEVICE_WINDOW_DAYS = 30;
/** Receipts are available ~15 min after the ticket ; older pending tickets are dropped. */
const TICKET_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingTicket {
  deviceId: string;
  at: number;
}

/**
 * Native push through the Expo Push Service (B37.4, ADR-015 §2/§3).
 * Bound to `MOBILE_PUSH_SENDER` ; `notifications` calls it without knowing
 * this module. Tickets are kept in memory and their receipts polled every
 * 15 minutes to null out tokens reported `DeviceNotRegistered`.
 */
@Injectable()
export class MobilePushService implements IMobilePushSender {
  private readonly logger = new Logger(MobilePushService.name);
  /** ticket id → device ; process-local, lost on restart (acceptable : the next send re-detects dead tokens). */
  private readonly pending = new Map<string, PendingTicket>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly expo: ExpoPushAdapter,
    @Inject(SYSTEM_CONFIG_RESOLVER) private readonly configs: ISystemConfigResolver,
  ) {}

  private async enabled(): Promise<boolean> {
    const v = await this.configs.resolve('mobile.push.enabled');
    return v === undefined || v === '' || v === 'true' || v === '1';
  }

  private async accessToken(): Promise<string | undefined> {
    return this.configs.resolve('mobile.expo-access-token');
  }

  private async activeDevices(userId: string) {
    const since = new Date(Date.now() - ACTIVE_DEVICE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.device.findMany({
      where: { userId, revokedAt: null, pushToken: { not: null }, pushTokenInvalidatedAt: null, lastSeenAt: { gt: since } },
      select: { id: true, pushToken: true, platform: true },
    });
  }

  async hasActiveDevice(userId: string): Promise<boolean> {
    if (!(await this.enabled())) return false;
    return (await this.activeDevices(userId)).length > 0;
  }

  async sendToUser(input: MobilePushInput): Promise<boolean> {
    if (!(await this.enabled())) return false;
    const devices = (await this.activeDevices(input.userId)).filter((d) => ExpoPushAdapter.isExpoToken(d.pushToken));
    if (devices.length === 0) return false;

    const tickets = await this.expo.send(
      devices.map((d) => ({ to: d.pushToken as string, title: input.title, body: input.body, data: input.data, sound: 'default', priority: 'high', channelId: 'default' })),
      await this.accessToken(),
    );

    let ok = 0;
    for (let i = 0; i < devices.length; i += 1) {
      const t = tickets[i];
      if (t?.status === 'ok' && t.id) {
        ok += 1;
        this.pending.set(t.id, { deviceId: devices[i].id, at: Date.now() });
      } else if (t?.details?.error === 'DeviceNotRegistered') {
        await this.invalidate(devices[i].id);
      } else if (t) {
        this.logger.warn(`Push ticket error for device ${devices[i].id}: ${t.message ?? t.details?.error ?? 'unknown'}`);
      }
    }
    return ok > 0;
  }

  /** Every 15 minutes : purge tokens Expo reports as unregistered. */
  @Cron('*/15 * * * *', { name: 'mobile-push-receipts' })
  async pollReceipts(): Promise<number> {
    const now = Date.now();
    for (const [id, t] of this.pending) if (now - t.at > TICKET_MAX_AGE_MS) this.pending.delete(id);
    const ids = [...this.pending.keys()];
    if (ids.length === 0) return 0;

    const receipts = await this.expo.receipts(ids, await this.accessToken());
    let invalidated = 0;
    for (const [id, receipt] of Object.entries(receipts)) {
      const t = this.pending.get(id);
      this.pending.delete(id);
      if (!t) continue;
      if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        await this.invalidate(t.deviceId);
        invalidated += 1;
      } else if (receipt.status === 'error') {
        this.logger.warn(`Push receipt error for device ${t.deviceId}: ${receipt.message ?? receipt.details?.error}`);
      }
    }
    if (invalidated > 0) this.logger.log(`Invalidated ${invalidated} unregistered push token(s)`);
    return invalidated;
  }

  private async invalidate(deviceId: string): Promise<void> {
    await this.prisma.device.updateMany({ where: { id: deviceId }, data: { pushToken: null, pushTokenInvalidatedAt: new Date() } });
  }

  /** Test hook. */
  pendingCount(): number {
    return this.pending.size;
  }
}
