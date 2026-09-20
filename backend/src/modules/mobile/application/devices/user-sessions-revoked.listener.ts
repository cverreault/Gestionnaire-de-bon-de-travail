import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  USER_SESSIONS_REVOKED_EVENT,
  type UserSessionsRevokedPayload,
  type UserSessionsRevokedResult,
} from '../../../../common/contracts/user-events.contract';
import { DevicesService } from './devices.service';

/**
 * Admin « déconnecter partout » / deactivation : every registered device of
 * the user is revoked (push token dropped, `mobile.device.revoked` emitted
 * per device so `auth` also kills the device-bound refresh tokens).
 */
@Injectable()
export class UserSessionsRevokedDevicesListener {
  private readonly logger = new Logger(UserSessionsRevokedDevicesListener.name);

  constructor(private readonly devices: DevicesService) {}

  @OnEvent(USER_SESSIONS_REVOKED_EVENT, { async: true, promisify: true })
  async onSessionsRevoked(event: UserSessionsRevokedPayload): Promise<UserSessionsRevokedResult> {
    const devices = await this.devices.revokeAllFor({ id: event.userId, tenantId: event.tenantId }, 'admin');
    this.logger.log(`Devices of user ${event.userId} revoked (${event.reason}) — ${devices} device(s)`);
    return { devices };
  }
}
