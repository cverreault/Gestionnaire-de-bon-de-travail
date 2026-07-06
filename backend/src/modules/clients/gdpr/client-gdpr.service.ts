import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * B16 — GDPR / PIPEDA compliance endpoints for tenant clients.
 *
 * Two capabilities on a Client :
 *   • `export()`  — dumps every piece of data linked to the client into a
 *                   single JSON blob : profile, addresses, work orders,
 *                   attachments (metadata only — files stay in MinIO),
 *                   audit log entries mentioning the client's id.
 *   • `anonymize()` — the « right to be forgotten » path. Scrubs personal
 *                   info in-place (name → `Client anonymisé <shortId>`,
 *                   email/phone → null, notes stripped). Related WOs and
 *                   invoices are KEPT (business record) but their client
 *                   reference is preserved to the anonymized row.
 *
 * The service refuses to anonymize a client with active (non-terminal) BTs
 * — the operator must close them first.
 */
@Injectable()
export class ClientGdprService {
  private readonly logger = new Logger(ClientGdprService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async export(tenantId: string, clientId: string): Promise<ClientExportBlob> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
      include: {
        addresses: true,
        workOrders: {
          include: {
            attachments: {
              select: {
                id: true,
                fileName: true,
                mimeType: true,
                fileSize: true,
                uploadedAt: true,
              },
            },
            notes: {
              select: {
                id: true,
                content: true,
                createdAt: true,
                authorId: true,
              },
            },
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Client introuvable.');

    // Audit trail — any entry whose `aggregateId` equals this client id.
    const auditEntries = await this.prisma.auditLog.findMany({
      where: { tenantId, aggregateId: clientId },
      orderBy: { occurredAt: 'desc' },
      take: 5000,
      select: {
        id: true,
        eventName: true,
        occurredAt: true,
        actorUserId: true,
        data: true,
      },
    });

    return {
      exportGeneratedAt: new Date().toISOString(),
      exportVersion: '1',
      client,
      auditEntries,
    };
  }

  async anonymize(
    tenantId: string,
    clientId: string,
    actorUserId: string,
  ): Promise<{ ok: true }> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true, isActive: true },
    });
    if (!client) throw new NotFoundException('Client introuvable.');

    // Refuse if any WO is still active (non-terminal). This forces the
    // operator to close them first — you can't erase a client mid-service.
    const activeCount = await this.prisma.workOrder.count({
      where: {
        clientId,
        tenantId,
        status: {
          notIn: ['COMPLETED_POSITIVE', 'COMPLETED_NEGATIVE'] as never,
        },
      },
    });
    if (activeCount > 0) {
      throw new BadRequestException(
        `Ce client a ${activeCount} bon(s) de travail actif(s). Terminez-les avant l'anonymisation.`,
      );
    }

    // In one transaction, scrub the client + its addresses + strip note
    // contents on ALL WOs (notes may contain personal info).
    const shortId = clientId.slice(0, 6);
    await this.prisma.$transaction([
      this.prisma.client.update({
        where: { id: clientId },
        data: {
          // firstName + lastName are non-nullable — set to a sentinel value.
          firstName: 'Anonymisé',
          lastName: shortId,
          companyName: null,
          email: null,
          phone: null,
          notes: null,
          isActive: false,
        },
      }),
      // `street`, `city`, `postalCode`, `province` are non-nullable — set
      // to a placeholder that makes clear the row was scrubbed.
      this.prisma.clientAddress.updateMany({
        where: { clientId },
        data: {
          label: null,
          streetNumber: null,
          street: '[anonymisé]',
          apartment: null,
          city: '[anonymisé]',
          postalCode: '[anonymisé]',
          province: '[anonymisé]',
          latitude: null,
          longitude: null,
          typeData: {},
        },
      }),
      // Scrub note contents on WOs of this client — content may contain PII.
      this.prisma.note.updateMany({
        where: { workOrder: { clientId } },
        data: { content: '[anonymisé]' },
      }),
    ]);

    this.eventEmitter.emit('clients.client.anonymized', {
      eventName: 'clients.client.anonymized',
      occurredAt: new Date(),
      aggregateId: clientId,
      tenantId,
      actorUserId,
      data: { shortId },
    });

    this.logger.log(
      `Client ${clientId} anonymized by ${actorUserId} (tenant=${tenantId})`,
    );
    return { ok: true as const };
  }
}

// ─── Types ─────────────────────────────────────────────────────────

export interface ClientExportBlob {
  exportGeneratedAt: string;
  exportVersion: string;
  client: unknown;
  auditEntries: Array<{
    id: string;
    eventName: string;
    occurredAt: Date;
    actorUserId: string | null;
    data: unknown;
  }>;
}
