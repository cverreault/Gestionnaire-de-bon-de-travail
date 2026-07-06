import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PartSource, Role, StockMovementType, WorkOrderStatus } from '@prisma/client';
import { StockService, STOCK_LOW_EVENT } from './stock.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * B24 — stock math unit tests over an in-memory fake of the few Prisma
 * surfaces StockService touches. Focus: negative-stock guards, transfer
 * both ways, usage/revert symmetry, threshold-crossing alert fired
 * exactly once, technician IDOR.
 */

type PartRow = {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  isActive: boolean;
  costPrice: number;
  salePrice: number;
  quantityOnHand: number;
  minStock: number;
};

function makeHarness(opts?: { warehouseQty?: number; minStock?: number }) {
  const part: PartRow = {
    id: 'part-1',
    tenantId: 't-1',
    sku: 'SKU-1',
    name: 'Câble',
    isActive: true,
    costPrice: 10,
    salePrice: 20,
    quantityOnHand: opts?.warehouseQty ?? 10,
    minStock: opts?.minStock ?? 0,
  };
  const trucks = new Map<string, { id: string; quantity: number }>(); // technicianId → row
  const movements: Array<{ type: StockMovementType; quantity: number }> = [];
  const woParts = new Map<string, Record<string, unknown>>();
  let woPartSeq = 0;

  const workOrder: { id: string; status: WorkOrderStatus; assignedToId: string } = {
    id: 'wo-1',
    status: WorkOrderStatus.IN_PROGRESS,
    assignedToId: 'tech-1',
  };

  const tx = {
    part: {
      findUniqueOrThrow: jest.fn(async (args: { select?: unknown }) =>
        args?.select ? { quantityOnHand: part.quantityOnHand, minStock: part.minStock } : { ...part },
      ),
      update: jest.fn(async (args: { data: Record<string, { increment?: number } | number> }) => {
        const q = args.data.quantityOnHand as { increment?: number } | number;
        if (typeof q === 'number') part.quantityOnHand = q;
        else if (q?.increment !== undefined) part.quantityOnHand += q.increment;
        return { ...part };
      }),
    },
    technicianPartStock: {
      findUnique: jest.fn(async (args: { where: { partId_technicianId: { technicianId: string } } }) => {
        const row = trucks.get(args.where.partId_technicianId.technicianId);
        return row ? { id: row.id, quantity: row.quantity } : null;
      }),
      update: jest.fn(async (args: { where: { id: string }; data: { quantity: number } }) => {
        for (const row of trucks.values()) {
          if (row.id === args.where.id) row.quantity = args.data.quantity;
        }
      }),
      create: jest.fn(async (args: { data: { technicianId: string; quantity: number } }) => {
        trucks.set(args.data.technicianId, {
          id: `truck-${args.data.technicianId}`,
          quantity: args.data.quantity,
        });
      }),
    },
    stockMovement: {
      create: jest.fn(async (args: { data: { type: StockMovementType; quantity: number } }) => {
        movements.push({ type: args.data.type, quantity: args.data.quantity });
      }),
    },
    workOrderPart: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        const id = `wop-${++woPartSeq}`;
        const row = { id, ...args.data };
        woParts.set(id, row);
        return row;
      }),
      delete: jest.fn(async (args: { where: { id: string } }) => {
        woParts.delete(args.where.id);
      }),
    },
  };

  const prisma = {
    part: {
      findUnique: jest.fn(async () => ({ ...part })),
      findFirst: jest.fn(async () => (part.isActive ? { ...part } : null)),
    },
    user: {
      findFirst: jest.fn(async () => ({ id: 'tech-1' })),
    },
    workOrder: {
      findUnique: jest.fn(async () => ({ ...workOrder })),
    },
    workOrderPart: {
      findFirst: jest.fn(async (args: { where: { id: string } }) => woParts.get(args.where.id) ?? null),
      findMany: jest.fn(async () => [...woParts.values()]),
    },
    technicianPartStock: {
      findMany: jest.fn(async () => []),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;

  const emitted: Array<{ event: string; payload: unknown }> = [];
  const eventEmitter = {
    emit: jest.fn((event: string, payload: unknown) => {
      emitted.push({ event, payload });
      return true;
    }),
  } as unknown as EventEmitter2;

  const service = new StockService(prisma, eventEmitter);
  const admin = { id: 'admin-1', role: Role.ADMIN };
  const tech = { id: 'tech-1', role: Role.TECHNICIAN };
  const otherTech = { id: 'tech-2', role: Role.TECHNICIAN };

  return { service, part, trucks, movements, emitted, workOrder, admin, tech, otherTech, woParts };
}

describe('StockService — warehouse ops', () => {
  it('receive increments the warehouse and journals a RECEIPT', async () => {
    const h = makeHarness({ warehouseQty: 10 });
    await h.service.receive('part-1', 5, 'PO#1', h.admin);
    expect(h.part.quantityOnHand).toBe(15);
    expect(h.movements).toEqual([{ type: StockMovementType.RECEIPT, quantity: 5 }]);
  });

  it('refuses a negative warehouse result on adjust', async () => {
    const h = makeHarness({ warehouseQty: 3 });
    await expect(
      h.service.adjust('part-1', -5, undefined, 'décompte', h.admin),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.part.quantityOnHand).toBe(3);
  });
});

describe('StockService — transfers', () => {
  it('TO_TECH moves quantity warehouse → truck', async () => {
    const h = makeHarness({ warehouseQty: 10 });
    await h.service.transfer('part-1', 'tech-1', 4, 'TO_TECH', h.admin);
    expect(h.part.quantityOnHand).toBe(6);
    expect(h.trucks.get('tech-1')?.quantity).toBe(4);
    expect(h.movements[0].type).toBe(StockMovementType.TRANSFER_TO_TECH);
  });

  it('TO_WAREHOUSE refuses when the truck lacks quantity', async () => {
    const h = makeHarness({ warehouseQty: 10 });
    await expect(
      h.service.transfer('part-1', 'tech-1', 2, 'TO_WAREHOUSE', h.admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('StockService — work-order usage', () => {
  it('technician usage consumes their truck by default and reverts symmetrically', async () => {
    const h = makeHarness({ warehouseQty: 10 });
    await h.service.transfer('part-1', 'tech-1', 4, 'TO_TECH', h.admin);

    const row = (await h.service.addWorkOrderPart(
      'wo-1',
      { partId: 'part-1', quantity: 3 },
      h.tech,
    )) as { id: string; source: PartSource };
    expect(row.source).toBe(PartSource.TECHNICIAN_STOCK);
    expect(h.trucks.get('tech-1')?.quantity).toBe(1);

    await h.service.removeWorkOrderPart('wo-1', row.id, h.tech);
    expect(h.trucks.get('tech-1')?.quantity).toBe(4);
    const types = h.movements.map((m) => m.type);
    expect(types).toContain(StockMovementType.USAGE);
    expect(types).toContain(StockMovementType.USAGE_REVERT);
  });

  it('staff usage consumes the warehouse by default and refuses insufficient stock', async () => {
    const h = makeHarness({ warehouseQty: 2 });
    await expect(
      h.service.addWorkOrderPart('wo-1', { partId: 'part-1', quantity: 99 }, h.admin),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.part.quantityOnHand).toBe(2);
  });

  it('technician cannot touch another technician’s work order', async () => {
    const h = makeHarness();
    await expect(
      h.service.addWorkOrderPart('wo-1', { partId: 'part-1', quantity: 1 }, h.otherTech),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses usage on a completed work order', async () => {
    const h = makeHarness();
    h.workOrder.status = WorkOrderStatus.COMPLETED_POSITIVE;
    await expect(
      h.service.addWorkOrderPart('wo-1', { partId: 'part-1', quantity: 1 }, h.admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('StockService — low-stock alert', () => {
  it('fires exactly once when the warehouse crosses the threshold', async () => {
    const h = makeHarness({ warehouseQty: 6, minStock: 5 });
    // 6 → 4 : crossing → one event
    await h.service.addWorkOrderPart('wo-1', { partId: 'part-1', quantity: 2 }, h.admin);
    // 4 → 3 : already below → no new event
    await h.service.addWorkOrderPart('wo-1', { partId: 'part-1', quantity: 1 }, h.admin);
    const lowEvents = h.emitted.filter((e) => e.event === STOCK_LOW_EVENT);
    expect(lowEvents).toHaveLength(1);
    expect((lowEvents[0].payload as { quantity: number }).quantity).toBe(4);
  });

  it('does not fire when minStock is 0', async () => {
    const h = makeHarness({ warehouseQty: 2, minStock: 0 });
    await h.service.addWorkOrderPart('wo-1', { partId: 'part-1', quantity: 1 }, h.admin);
    expect(h.emitted.filter((e) => e.event === STOCK_LOW_EVENT)).toHaveLength(0);
  });
});
