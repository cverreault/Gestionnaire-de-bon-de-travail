import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import type { IDomainEvent } from '../../../../common/contracts';

/**
 * Service applicatif du module audit.
 *
 * Persiste les domain events dans `audit_logs` et expose des lectures
 * paginées pour le futur écran admin `/admin/audit`.
 *
 * Pas d'UPDATE / DELETE — la table est append-only.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persiste un domain event. Idempotent par `eventId` :
   * si deux listeners reçoivent le même event, la 2e insertion est
   * silencieusement ignorée (`skipDuplicates: true`).
   */
  async record(event: IDomainEvent & { data?: unknown }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id:          event.eventId,
          eventName:   event.name,
          aggregateId: event.aggregateId,
          occurredAt:  event.occurredAt,
          actorUserId: event.actorUserId,
          data:        (event.data ?? null) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Une duplication de clé n'est pas une erreur métier — log discret.
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        this.logger.debug(`Audit event déjà persisté : ${event.eventId}`);
        return;
      }
      // Autre erreur : on logue mais on n'interrompt PAS le flux métier.
      // L'audit ne doit jamais bloquer une transition de BT.
      this.logger.error(
        `Échec de persistance d'un audit event (${event.name} / ${event.eventId})`,
        err,
      );
    }
  }

  // ── Read APIs (pour /api/audit, admin) ──────────────────────────────

  async findRecentForAggregate(aggregateId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { aggregateId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
  }

  async findAllPaginated(opts: {
    page?: number;
    limit?: number;
    eventName?: string;
    aggregateId?: string;
    actorUserId?: string;
    from?: Date;
    to?: Date;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const where: Prisma.AuditLogWhereInput = {
      ...(opts.eventName && { eventName: opts.eventName }),
      ...(opts.aggregateId && { aggregateId: opts.aggregateId }),
      ...(opts.actorUserId && { actorUserId: opts.actorUserId }),
      ...(opts.from || opts.to
        ? {
            occurredAt: {
              ...(opts.from && { gte: opts.from }),
              ...(opts.to && { lte: opts.to }),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
