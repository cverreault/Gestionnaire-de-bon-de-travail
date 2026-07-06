import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * B21 — housekeeping reactor for the portal.
 *
 * When a client record is deleted, its portal accounts must stop
 * working. Client deletion is a SOFT delete (clients.service sets
 * isActive=false, the row survives), so User.clientId still points at
 * the deleted client — target the accounts directly. Deactivate rather
 * than delete: audit trail, and a re-invite on the same client
 * reactivates the account.
 */
@Injectable()
export class PortalClientEventsListener {
  private readonly logger = new Logger(PortalClientEventsListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('clients.client.deleted', { async: true, promisify: true })
  async onClientDeleted(event: { aggregateId: string; tenantId?: string }) {
    try {
      const result = await this.prisma.user.updateMany({
        where: {
          role: Role.CLIENT,
          clientId: event.aggregateId,
          isActive: true,
          // Explicit tenant guard — don't rely on ALS context surviving
          // into the async listener.
          ...(event.tenantId ? { tenantId: event.tenantId } : {}),
        },
        data: { isActive: false },
      });
      if (result.count > 0) {
        this.logger.log(
          `Client ${event.aggregateId} deleted — deactivated ${result.count} portal account(s).`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to deactivate portal accounts for deleted client ${event.aggregateId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
