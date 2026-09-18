import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  GEO_ROLL_IMPORTED_EVENT,
  type GeoRollImportedPayload,
} from '../../../common/contracts/geo-events.contract';

/**
 * B40.3 — when a new assessment roll is imported, every address must be
 * matched again: clear the stamp so the dispatch-map sweep re-runs the
 * property lookup (200 per pass, local queries). Runs outside a request,
 * so the tenant-scope middleware lets it touch all tenants — intended.
 */
@Injectable()
export class GeoRollListener {
  private readonly logger = new Logger(GeoRollListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(GEO_ROLL_IMPORTED_EVENT, { async: true, promisify: true })
  async onRollImported(event: GeoRollImportedPayload) {
    const r = await this.prisma.clientAddress.updateMany({
      where: { propertyMatchedAt: { not: null } },
      data: { propertyMatchedAt: null },
    });
    this.logger.log(`Roll ${event.rollYear} imported — ${r.count} addresses queued for property re-match`);
  }
}
