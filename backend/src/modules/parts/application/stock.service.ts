import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PartSource,
  Prisma,
  Role,
  StockMovementType,
  WorkOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

/** Authenticated caller, as attached by JwtStrategy. */
export interface StockActor {
  id: string;
  role: Role;
}

export const STOCK_LOW_EVENT = 'inventory.stock.low';

export interface StockLowEvent {
  partId: string;
  sku: string;
  name: string;
  quantity: number;
  minStock: number;
  tenantId: string;
}

/**
 * B24 — all stock math. Every quantity change happens inside ONE Prisma
 * transaction together with its StockMovement journal row; negative
 * results are refused with a 409 that names the available quantity.
 *
 * Low-stock alerting: `inventory.stock.low` is emitted only when a
 * WAREHOUSE decrement CROSSES the part's minStock threshold (before >=
 * min, after < min) — one alert per crossing, no spam on every
 * subsequent movement.
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Warehouse ops ──────────────────────────────────────────────────────────

  async receive(partId: string, quantity: number, note: string | undefined, actor: StockActor) {
    if (quantity <= 0) throw new ConflictException('Quantité invalide');
    const part = await this.requirePart(partId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.part.update({
        where: { id: partId },
        data: { quantityOnHand: { increment: quantity } },
      });
      await tx.stockMovement.create({
        data: {
          partId,
          tenantId: part.tenantId,
          type: StockMovementType.RECEIPT,
          quantity,
          note: note ?? null,
          createdById: actor.id,
        },
      });
      return u;
    });
    return this.summary(updated);
  }

  /** Signed delta; positive or negative. Targets warehouse or a truck. */
  async adjust(
    partId: string,
    delta: number,
    technicianId: string | undefined,
    note: string | undefined,
    actor: StockActor,
  ) {
    if (delta === 0) throw new ConflictException('Le delta ne peut pas être 0');
    const part = await this.requirePart(partId);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (technicianId) {
        await this.changeTruckQuantity(tx, part.tenantId, partId, technicianId, delta);
      } else {
        await this.changeWarehouseQuantity(tx, part, delta);
      }
      await tx.stockMovement.create({
        data: {
          partId,
          tenantId: part.tenantId,
          type: StockMovementType.ADJUSTMENT,
          quantity: delta,
          technicianId: technicianId ?? null,
          note: note ?? null,
          createdById: actor.id,
        },
      });
      return tx.part.findUniqueOrThrow({ where: { id: partId } });
    });
    return this.summary(updated);
  }

  async transfer(
    partId: string,
    technicianId: string,
    quantity: number,
    direction: 'TO_TECH' | 'TO_WAREHOUSE',
    actor: StockActor,
  ) {
    if (quantity <= 0) throw new ConflictException('Quantité invalide');
    const part = await this.requirePart(partId);

    const technician = await this.prisma.user.findFirst({
      where: { id: technicianId, role: Role.TECHNICIAN, isActive: true },
      select: { id: true },
    });
    if (!technician) throw new NotFoundException('Technicien introuvable ou inactif');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (direction === 'TO_TECH') {
        await this.changeWarehouseQuantity(tx, part, -quantity);
        await this.changeTruckQuantity(tx, part.tenantId, partId, technicianId, quantity);
      } else {
        await this.changeTruckQuantity(tx, part.tenantId, partId, technicianId, -quantity);
        await this.changeWarehouseQuantity(tx, part, quantity);
      }
      await tx.stockMovement.create({
        data: {
          partId,
          tenantId: part.tenantId,
          type:
            direction === 'TO_TECH'
              ? StockMovementType.TRANSFER_TO_TECH
              : StockMovementType.TRANSFER_TO_WAREHOUSE,
          quantity,
          technicianId,
          createdById: actor.id,
        },
      });
      return tx.part.findUniqueOrThrow({ where: { id: partId } });
    });
    return this.summary(updated);
  }

  // ── Work-order usage ───────────────────────────────────────────────────────

  async listWorkOrderParts(workOrderId: string, actor: StockActor) {
    await this.requireWorkOrderAccess(workOrderId, actor);
    return this.prisma.workOrderPart.findMany({
      where: { workOrderId },
      include: {
        part: { select: { sku: true, name: true, nameFr: true, nameEn: true, unit: true } },
        addedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addWorkOrderPart(
    workOrderId: string,
    input: { partId: string; quantity: number; source?: PartSource },
    actor: StockActor,
  ) {
    if (input.quantity <= 0) throw new ConflictException('Quantité invalide');
    const workOrder = await this.requireWorkOrderAccess(workOrderId, actor);
    this.refuseWhenTerminal(workOrder.status);

    const part = await this.prisma.part.findFirst({
      where: { id: input.partId, isActive: true },
    });
    if (!part) throw new NotFoundException('Pièce introuvable ou inactive');

    // Source resolution: a technician consumes from their own truck by
    // default; staff consume from the warehouse. TECHNICIAN_STOCK chosen
    // by staff falls back to the WO's assigned technician's truck.
    const source =
      input.source ??
      (actor.role === Role.TECHNICIAN ? PartSource.TECHNICIAN_STOCK : PartSource.WAREHOUSE);
    let technicianId: string | null = null;
    if (source === PartSource.TECHNICIAN_STOCK) {
      technicianId =
        actor.role === Role.TECHNICIAN ? actor.id : workOrder.assignedToId;
      if (!technicianId) {
        throw new ConflictException(
          'Aucun technicien assigné — impossible de puiser dans un stock de camion.',
        );
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (source === PartSource.WAREHOUSE) {
        await this.changeWarehouseQuantity(tx, part, -input.quantity);
      } else {
        await this.changeTruckQuantity(tx, part.tenantId, part.id, technicianId!, -input.quantity);
      }
      const created = await tx.workOrderPart.create({
        data: {
          workOrderId,
          tenantId: part.tenantId,
          partId: part.id,
          quantity: input.quantity,
          source,
          technicianId,
          unitCostPrice: part.costPrice,
          unitSalePrice: part.salePrice,
          addedById: actor.id,
        },
        include: {
          part: { select: { sku: true, name: true, nameFr: true, nameEn: true, unit: true } },
          addedBy: { select: { firstName: true, lastName: true } },
        },
      });
      await tx.stockMovement.create({
        data: {
          partId: part.id,
          tenantId: part.tenantId,
          type: StockMovementType.USAGE,
          quantity: input.quantity,
          technicianId,
          workOrderId,
          createdById: actor.id,
        },
      });
      return created;
    });
    return row;
  }

  async removeWorkOrderPart(workOrderId: string, rowId: string, actor: StockActor) {
    const workOrder = await this.requireWorkOrderAccess(workOrderId, actor);
    this.refuseWhenTerminal(workOrder.status);

    const row = await this.prisma.workOrderPart.findFirst({
      where: { id: rowId, workOrderId },
    });
    if (!row) throw new NotFoundException('Ligne de pièce introuvable');
    if (actor.role === Role.TECHNICIAN && row.addedById !== actor.id) {
      throw new ForbiddenException('Vous ne pouvez retirer que vos propres pièces');
    }

    const part = await this.requirePart(row.partId);
    await this.prisma.$transaction(async (tx) => {
      if (row.source === PartSource.WAREHOUSE) {
        await this.changeWarehouseQuantity(tx, part, row.quantity);
      } else if (row.technicianId) {
        await this.changeTruckQuantity(tx, part.tenantId, part.id, row.technicianId, row.quantity);
      }
      await tx.workOrderPart.delete({ where: { id: row.id } });
      await tx.stockMovement.create({
        data: {
          partId: part.id,
          tenantId: part.tenantId,
          type: StockMovementType.USAGE_REVERT,
          quantity: row.quantity,
          technicianId: row.technicianId,
          workOrderId,
          createdById: actor.id,
        },
      });
    });
    return { removed: true };
  }

  // ── Technician self-service ────────────────────────────────────────────────

  async myTruckStock(technicianId: string) {
    return this.prisma.technicianPartStock.findMany({
      where: { technicianId, quantity: { gt: 0 } },
      include: {
        part: { select: { sku: true, name: true, nameFr: true, nameEn: true, unit: true } },
      },
      orderBy: { part: { name: 'asc' } },
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async requirePart(partId: string) {
    const part = await this.prisma.part.findUnique({ where: { id: partId } });
    if (!part) throw new NotFoundException('Pièce introuvable');
    return part;
  }

  /** Technician IDOR guard mirrored from work-orders notes. */
  private async requireWorkOrderAccess(workOrderId: string, actor: StockActor) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, status: true, assignedToId: true },
    });
    if (!workOrder) throw new NotFoundException('Bon de travail introuvable');
    if (actor.role === Role.TECHNICIAN && workOrder.assignedToId !== actor.id) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres bons de travail',
      );
    }
    return workOrder;
  }

  private refuseWhenTerminal(status: WorkOrderStatus) {
    if (
      status === WorkOrderStatus.COMPLETED_POSITIVE ||
      status === WorkOrderStatus.COMPLETED_NEGATIVE
    ) {
      throw new ConflictException('Bon de travail complété — pièces verrouillées');
    }
  }

  /**
   * Warehouse delta with negative-stock guard + threshold-crossing alert.
   * Must run inside the caller's transaction; the event is emitted after
   * the update (emission is fire-and-forget, no rollback concern).
   */
  private async changeWarehouseQuantity(
    tx: Prisma.TransactionClient,
    part: { id: string; tenantId: string; sku: string; name: string; minStock: number },
    delta: number,
  ) {
    const current = await tx.part.findUniqueOrThrow({
      where: { id: part.id },
      select: { quantityOnHand: true, minStock: true },
    });
    const after = current.quantityOnHand + delta;
    if (after < 0) {
      throw new ConflictException(
        `Stock entrepôt insuffisant (${current.quantityOnHand} disponible)`,
      );
    }
    await tx.part.update({
      where: { id: part.id },
      data: { quantityOnHand: after },
    });
    if (
      delta < 0 &&
      current.minStock > 0 &&
      current.quantityOnHand >= current.minStock &&
      after < current.minStock
    ) {
      const payload: StockLowEvent = {
        partId: part.id,
        sku: part.sku,
        name: part.name,
        quantity: after,
        minStock: current.minStock,
        tenantId: part.tenantId,
      };
      this.eventEmitter.emit(STOCK_LOW_EVENT, payload);
      this.logger.warn(
        `Low stock: ${part.sku} « ${part.name} » — ${after} < ${current.minStock}`,
      );
    }
  }

  private async changeTruckQuantity(
    tx: Prisma.TransactionClient,
    tenantId: string,
    partId: string,
    technicianId: string,
    delta: number,
  ) {
    const existing = await tx.technicianPartStock.findUnique({
      where: { partId_technicianId: { partId, technicianId } },
      select: { id: true, quantity: true },
    });
    const after = (existing?.quantity ?? 0) + delta;
    if (after < 0) {
      throw new ConflictException(
        `Stock camion insuffisant (${existing?.quantity ?? 0} disponible)`,
      );
    }
    if (existing) {
      await tx.technicianPartStock.update({
        where: { id: existing.id },
        data: { quantity: after },
      });
    } else {
      await tx.technicianPartStock.create({
        data: { tenantId, partId, technicianId, quantity: after },
      });
    }
  }

  private summary(part: { id: string; quantityOnHand: number }) {
    return { id: part.id, quantityOnHand: part.quantityOnHand };
  }
}
