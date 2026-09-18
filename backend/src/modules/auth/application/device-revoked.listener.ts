import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  MOBILE_DEVICE_REVOKED_EVENT,
  type MobileDeviceRevokedPayload,
} from '../../../common/contracts/mobile-events.contract';

/**
 * B37.3 / ADR-015 §4 — when the `mobile` module revokes a device, every
 * refresh token issued from that installation is revoked so the phone cannot
 * mint new access tokens. Emitted with `emitAsync`, so the revocation is done
 * before the HTTP response. Runs in the request context of the DELETE call,
 * hence tenant-scoped.
 */
@Injectable()
export class DeviceRevokedListener {
  private readonly logger = new Logger(DeviceRevokedListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(MOBILE_DEVICE_REVOKED_EVENT, { async: true, promisify: true })
  async onDeviceRevoked(event: MobileDeviceRevokedPayload): Promise<void> {
    const r = await this.prisma.refreshToken.updateMany({
      where: { deviceId: event.installationId, userId: event.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.log(
      `Device ${event.installationId} revoked (${event.reason}) — ${r.count} refresh token(s) revoked for user ${event.userId}`,
    );
  }
}
