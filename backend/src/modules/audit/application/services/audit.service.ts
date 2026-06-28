import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, type Prisma } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import type { IDomainEvent } from '../../../../common/contracts';

interface CurrentUserRef {
  id: string;
  role: Role;
}

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

  /**
   * Timeline d'un agrégat (ex: un workOrder).
   *
   * Object-level RBAC : si l'appelant est TECHNICIEN, on vérifie qu'il est
   * bien assigné au workOrder référencé (l'aggregateId correspond aujourd'hui
   * toujours à un workOrderId). Les ADMIN et DISPATCHER bypass.
   *
   * 404 si le BT n'existe pas / 403 si le tech n'en est pas le titulaire.
   */
  async findRecentForAggregate(
    aggregateId: string,
    currentUser: CurrentUserRef,
    limit = 50,
  ) {
    if (currentUser.role === Role.TECHNICIAN) {
      const wo = await this.prisma.workOrder.findUnique({
        where: { id: aggregateId },
        select: { assignedToId: true },
      });
      if (!wo) {
        throw new NotFoundException(`Agrégat #${aggregateId} introuvable`);
      }
      if (wo.assignedToId !== currentUser.id) {
        throw new ForbiddenException(
          "Vous ne pouvez consulter que l'historique de vos propres bons de travail",
        );
      }
    }

    // 1. Charger les events.
    const rows = await this.prisma.auditLog.findMany({
      where: { aggregateId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    // 2. Charger en lot les utilisateurs concernés (un seul roundtrip).
    //    Le `users` est dans le schéma partagé — pas de violation ADR-001
    //    puisqu'on n'importe pas le service du module users.
    const actorIds = Array.from(
      new Set(rows.map((r) => r.actorUserId).filter((id): id is string => !!id)),
    );
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        })
      : [];
    const actorById = new Map(actors.map((u) => [u.id, u]));

    // 3. Hydrater chaque row avec l'acteur.
    return rows.map((r) => ({
      ...r,
      actor: r.actorUserId ? actorById.get(r.actorUserId) ?? null : null,
    }));
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
