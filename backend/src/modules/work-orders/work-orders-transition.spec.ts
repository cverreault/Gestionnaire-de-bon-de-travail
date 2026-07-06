/**
 * QA — work-orders-transition.spec.ts
 *
 * Unit-tests for WorkOrdersService.transition() covering:
 *  1. Admin bypass — admin can perform any transition
 *  2. Admin bypass is positioned AFTER IDOR check (technician cannot access another's WO)
 *  3. EN_ROUTE transition records no extra data (just status change)
 *  4. IN_PROGRESS sets actualStartTime only if not already set
 *  5. COMPLETED_NEGATIVE requires negativeReason for both admin and non-admin
 *  6. COMPLETED_POSITIVE → CREATED (reopen) requires reopenReason + admin role
 *  7. Non-admin technician blocked from invalid transitions
 *  8. ASSIGNED transition requires assignedToId
 */

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, WorkOrderStatus } from '@prisma/client';
import { WorkOrdersService } from './work-orders.service';

// ─── Prisma mock factory ──────────────────────────────────────────────────────

function makeMockPrisma(overrides: Partial<{
  status: WorkOrderStatus;
  assignedToId: string | null;
  actualStartTime: Date | null;
}> = {}) {
  const wo: {
    id: string;
    status: WorkOrderStatus;
    assignedToId: string | null;
    actualStartTime: Date | null;
    referenceNumber: string;
  } = {
    id: 'wo-1',
    status: WorkOrderStatus.DISPATCHED,
    assignedToId: 'tech-1',
    actualStartTime: null,
    referenceNumber: 'BT-20260430-0001',
    ...overrides,
  };

  return {
    workOrder: {
      findUnique: jest.fn().mockResolvedValue(wo),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...wo, ...data, referenceNumber: wo.referenceNumber }),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(wo),
    },
    note: { create: jest.fn(), findMany: jest.fn() },
  };
}

function buildService(prisma: any): WorkOrdersService {
  // Minimal stubs for ProcessEngineService and ProcessCacheService —
  // the tests below exercise the legacyTransition path (no processDefinitionId
  // configured on the mock workOrder), so these stubs are never called.
  const mockProcessEngine = {} as any;
  const mockProcessCache = {} as any;
  // EventEmitter2 stub — domain events are fire-and-forget; we ignore them
  // in these unit tests since the assertions live on Prisma calls.
  const mockEventEmitter = { emit: jest.fn(), emitAsync: jest.fn() } as any;
  // B15 — RemindersService stub. These tests don't exercise the reminder
  // scheduling code path (transitions don't touch it), so a no-op is fine.
  const mockReminders = { scheduleDefaultsForWorkOrder: jest.fn() } as any;
  return new WorkOrdersService(
    prisma as any,
    mockProcessEngine,
    mockProcessCache,
    mockEventEmitter,
    mockReminders,
  );
}

// ─── Admin bypass tests ───────────────────────────────────────────────────────

describe('WorkOrdersService.transition — admin bypass', () => {
  const adminUser = { id: 'admin-1', role: Role.ADMIN };

  it('admin can jump DISPATCHED → IN_PROGRESS (skips isValidTransition)', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.DISPATCHED });
    const svc = buildService(prisma);

    await expect(
      svc.transition('wo-1', { status: WorkOrderStatus.IN_PROGRESS }, adminUser),
    ).resolves.toBeDefined();

    expect(prisma.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: WorkOrderStatus.IN_PROGRESS }) }),
    );
  });

  it('admin can jump COMPLETED_POSITIVE → DISPATCHED (fully arbitrary)', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.COMPLETED_POSITIVE });
    const svc = buildService(prisma);

    // COMPLETED_POSITIVE → DISPATCHED: invalid for non-admin, but admin bypasses validation.
    // However the reopenReason guard only applies when transitioning to CREATED,
    // so this should succeed.
    await expect(
      svc.transition('wo-1', { status: WorkOrderStatus.DISPATCHED }, adminUser),
    ).resolves.toBeDefined();
  });

  it('admin bypass does NOT skip the IDOR check — cannot transition another technician\'s WO as own', async () => {
    // Simulates a technician (not admin) trying to transition a WO assigned to someone else
    const techUser = { id: 'tech-other', role: Role.TECHNICIAN };
    const prisma = makeMockPrisma({ status: WorkOrderStatus.DISPATCHED, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await expect(
      svc.transition('wo-1', { status: WorkOrderStatus.EN_ROUTE }, techUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ─── EN_ROUTE specific tests ──────────────────────────────────────────────────

describe('WorkOrdersService.transition — EN_ROUTE', () => {
  const techUser = { id: 'tech-1', role: Role.TECHNICIAN };

  it('DISPATCHED → EN_ROUTE succeeds for the assigned technician', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.DISPATCHED, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    const result = await svc.transition('wo-1', { status: WorkOrderStatus.EN_ROUTE }, techUser);
    expect(result).toBeDefined();
    expect(prisma.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: WorkOrderStatus.EN_ROUTE }),
      }),
    );
  });

  it('EN_ROUTE transition does NOT set actualStartTime', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.DISPATCHED, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await svc.transition('wo-1', { status: WorkOrderStatus.EN_ROUTE }, techUser);

    const updateCall = prisma.workOrder.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('actualStartTime');
  });

  it('EN_ROUTE → IN_PROGRESS succeeds', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.EN_ROUTE, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    const result = await svc.transition('wo-1', { status: WorkOrderStatus.IN_PROGRESS }, techUser);
    expect(result).toBeDefined();
  });

  it('DISPATCHED → IN_PROGRESS (skipping EN_ROUTE) is BLOCKED for non-admin', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.DISPATCHED, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await expect(
      svc.transition('wo-1', { status: WorkOrderStatus.IN_PROGRESS }, techUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── IN_PROGRESS business rules ───────────────────────────────────────────────

describe('WorkOrdersService.transition — IN_PROGRESS actualStartTime', () => {
  const techUser = { id: 'tech-1', role: Role.TECHNICIAN };

  it('sets actualStartTime when transitioning to IN_PROGRESS if not already set', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.EN_ROUTE, assignedToId: 'tech-1', actualStartTime: null });
    const svc = buildService(prisma);

    await svc.transition('wo-1', { status: WorkOrderStatus.IN_PROGRESS }, techUser);

    const updateCall = prisma.workOrder.update.mock.calls[0][0];
    expect(updateCall.data.actualStartTime).toBeInstanceOf(Date);
  });

  it('does NOT overwrite actualStartTime if already set (idempotent guard)', async () => {
    const existingStartTime = new Date('2026-04-30T08:00:00Z');
    const prisma = makeMockPrisma({
      status: WorkOrderStatus.EN_ROUTE,
      assignedToId: 'tech-1',
      actualStartTime: existingStartTime,
    });
    const svc = buildService(prisma);

    await svc.transition('wo-1', { status: WorkOrderStatus.IN_PROGRESS }, techUser);

    const updateCall = prisma.workOrder.update.mock.calls[0][0];
    // actualStartTime should NOT be in the update payload (no overwrite)
    expect(updateCall.data).not.toHaveProperty('actualStartTime');
  });
});

// ─── COMPLETED_NEGATIVE business rules ───────────────────────────────────────

describe('WorkOrdersService.transition — COMPLETED_NEGATIVE', () => {
  const techUser = { id: 'tech-1', role: Role.TECHNICIAN };
  const adminUser = { id: 'admin-1', role: Role.ADMIN };

  it('throws BadRequestException when negativeReason is missing (technician)', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.IN_PROGRESS, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await expect(
      svc.transition('wo-1', { status: WorkOrderStatus.COMPLETED_NEGATIVE }, techUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when negativeReason is empty string', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.IN_PROGRESS, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await expect(
      svc.transition('wo-1', { status: WorkOrderStatus.COMPLETED_NEGATIVE, negativeReason: '   ' }, techUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('succeeds when negativeReason is provided (technician)', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.IN_PROGRESS, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await expect(
      svc.transition(
        'wo-1',
        { status: WorkOrderStatus.COMPLETED_NEGATIVE, negativeReason: 'Client absent' },
        techUser,
      ),
    ).resolves.toBeDefined();
  });

  it('admin also requires negativeReason for COMPLETED_NEGATIVE (business rule not bypassed)', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.IN_PROGRESS, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await expect(
      svc.transition('wo-1', { status: WorkOrderStatus.COMPLETED_NEGATIVE }, adminUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── COMPLETED_POSITIVE → CREATED (admin reopen) ─────────────────────────────

describe('WorkOrdersService.transition — COMPLETED_POSITIVE reopen', () => {
  const adminUser = { id: 'admin-1', role: Role.ADMIN };
  const techUser  = { id: 'tech-1',  role: Role.TECHNICIAN };

  it('admin reopen requires reopenReason', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.COMPLETED_POSITIVE, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await expect(
      svc.transition('wo-1', { status: WorkOrderStatus.CREATED }, adminUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('admin reopen succeeds with valid reopenReason', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.COMPLETED_POSITIVE, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await expect(
      svc.transition('wo-1', { status: WorkOrderStatus.CREATED, reopenReason: 'Réclamation client' }, adminUser),
    ).resolves.toBeDefined();
  });

  it('technician cannot reopen a COMPLETED_POSITIVE WO (even their own)', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.COMPLETED_POSITIVE, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await expect(
      svc.transition('wo-1', { status: WorkOrderStatus.CREATED, reopenReason: 'test' }, techUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reopen clears completionNotes, actualEndTime, actualStartTime and disconnects assignee', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.COMPLETED_POSITIVE, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await svc.transition(
      'wo-1',
      { status: WorkOrderStatus.CREATED, reopenReason: 'Réclamation client' },
      adminUser,
    );

    const updateCall = prisma.workOrder.update.mock.calls[0][0];
    expect(updateCall.data.completionNotes).toBeNull();
    expect(updateCall.data.actualEndTime).toBeNull();
    expect(updateCall.data.actualStartTime).toBeNull();
    expect(updateCall.data.assignedTo).toEqual({ disconnect: true });
  });
});

// ─── ASSIGNED requires assignedToId ───────────────────────────────────────────

describe('WorkOrdersService.transition — ASSIGNED requires assignedToId', () => {
  const adminUser = { id: 'admin-1', role: Role.ADMIN };

  it('throws BadRequestException when transitioning to ASSIGNED without assignedToId', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.CREATED, assignedToId: null });
    const svc = buildService(prisma);

    await expect(
      svc.transition('wo-1', { status: WorkOrderStatus.ASSIGNED }, adminUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('succeeds when assignedToId is provided', async () => {
    const prisma = makeMockPrisma({ status: WorkOrderStatus.CREATED, assignedToId: null });
    const svc = buildService(prisma);

    await expect(
      svc.transition('wo-1', { status: WorkOrderStatus.ASSIGNED, assignedToId: 'tech-new' }, adminUser),
    ).resolves.toBeDefined();
  });
});

// ─── 404 handling ─────────────────────────────────────────────────────────────

describe('WorkOrdersService.transition — 404 handling', () => {
  it('throws NotFoundException when work order does not exist', async () => {
    const prisma = { workOrder: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } };
    const svc = buildService(prisma);

    await expect(
      svc.transition('non-existent-id', { status: WorkOrderStatus.EN_ROUTE }, { id: 'admin-1', role: Role.ADMIN }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
