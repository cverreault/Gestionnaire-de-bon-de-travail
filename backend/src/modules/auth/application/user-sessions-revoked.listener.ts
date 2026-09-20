import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  USER_SESSIONS_REVOKED_EVENT,
  type UserSessionsRevokedPayload,
  type UserSessionsRevokedResult,
} from '../../../common/contracts/user-events.contract';

/**
 * Admin « déconnecter partout » / deactivation : every live refresh token of
 * the user is revoked, web and mobile alike. Runs before the HTTP response
 * (emitAsync). The access tokens already issued expire on their own.
 */
@Injectable()
export class UserSessionsRevokedListener {
  private readonly logger = new Logger(UserSessionsRevokedListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(USER_SESSIONS_REVOKED_EVENT, { async: true, promisify: true })
  async onSessionsRevoked(event: UserSessionsRevokedPayload): Promise<UserSessionsRevokedResult> {
    const r = await this.prisma.refreshToken.updateMany({
      where: { tenantId: event.tenantId, userId: event.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.log(`Sessions of user ${event.userId} revoked (${event.reason}) by ${event.actorUserId ?? 'system'} — ${r.count} refresh token(s)`);
    return { refreshTokens: r.count };
  }
}
