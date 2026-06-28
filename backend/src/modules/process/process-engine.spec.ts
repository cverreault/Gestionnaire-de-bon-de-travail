/**
 * QA — process-engine.spec.ts
 *
 * Unit-tests for ProcessEngineService covering:
 *  1. executeTransition — IDOR check (TECHNICIAN cannot transition another's WO)
 *  2. executeTransition — admin bypass when no configured transition exists
 *  3. executeTransition — non-admin blocked when no configured transition
 *  4. executeTransition — non-admin blocked when role not in allowedRoles
 *  5. executeTransition — required field validation (missing assignedToId)
 *  6. executeTransition — required field validation (missing negativeReason)
 *  7. executeTransition — optimistic locking conflict detection
 *  8. executeTransition — side-effects: isDispatch sets dispatchedAt
 *  9. executeTransition — side-effects: isStart sets actualStartTime (only once)
 * 10. executeTransition — side-effects: isTerminalPositive sets actualEndTime
 * 11. executeTransition — side-effects: isInitial resets all timestamps & disconnects technician
 * 12. executeTransition — targetStepId not in process throws BadRequestException
 * 13. executeTransition — NotFoundException when WO does not exist
 * 14. getAvailableTransitions — IDOR check for TECHNICIAN on another's WO
 * 15. getAvailableTransitions — no currentStepId returns empty transitions
 * 16. getAvailableTransitions — ADMIN gets adminBypass=true + bypass transitions
 * 17. getAvailableTransitions — non-admin only sees transitions for their role
 * 18. mapToLegacyStatus — flag-based mapping
 * 19. mapToLegacyStatus — code-based fallback (100 → ASSIGNED, 300 → EN_ROUTE)
 * 20. mapToLegacyStatus — returns null for unknown status
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role, WorkOrderStatus } from '@prisma/client';
import { ProcessEngineService } from './process-engine.service';
import type { CachedProcess, CachedStatus } from './types/process.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStatus(overrides: Partial<CachedStatus> & { id: string; code: number }): CachedStatus {
  return {
    name: `Status ${overrides.code}`,
    color: '#aabbcc',
    position: overrides.code,
    isInitial: false,
    isDispatch: false,
    isStart: false,
    isTerminalPositive: false,
    isTerminalNegative: false,
    ...overrides,
  };
}

const STATUS_CREATED    = makeStatus({ id: 's-0',   code: 0,   name: 'Créé',      isInitial: true });
const STATUS_ASSIGNED   = makeStatus({ id: 's-100', code: 100, name: 'Assigné' });
const STATUS_DISPATCHED = makeStatus({ id: 's-200', code: 200, name: 'Dispatché', isDispatch: true });
const STATUS_EN_ROUTE   = makeStatus({ id: 's-300', code: 300, name: 'En route' });
const STATUS_IN_PROGRESS = makeStatus({ id: 's-400', code: 400, name: 'En cours', isStart: true });
const STATUS_DONE_POS   = makeStatus({ id: 's-500', code: 500, name: 'Complété+', isTerminalPositive: true });
const STATUS_DONE_NEG   = makeStatus({ id: 's-600', code: 600, name: 'Complété-', isTerminalNegative: true });

const ALL_STATUSES = [STATUS_CREATED, STATUS_ASSIGNED, STATUS_DISPATCHED, STATUS_EN_ROUTE, STATUS_IN_PROGRESS, STATUS_DONE_POS, STATUS_DONE_NEG];

function buildProcess(): CachedProcess {
  const statuses = new Map(ALL_STATUSES.map((s) => [s.id, s]));
  const statusByCode = new Map(ALL_STATUSES.map((s) => [s.code, s]));

  const transitions = new Map<string, any[]>([
    [STATUS_CREATED.id, [
      { id: 't-0-100', fromStatusId: STATUS_CREATED.id, toStatusId: STATUS_ASSIGNED.id, label: 'Assigner', allowedRoles: [Role.ADMIN, Role.DISPATCHER], requiredFields: ['assignedToId'], sortOrder: 0 },
    ]],
    [STATUS_ASSIGNED.id, [
      { id: 't-100-200', fromStatusId: STATUS_ASSIGNED.id, toStatusId: STATUS_DISPATCHED.id, label: 'Dispatcher', allowedRoles: [Role.ADMIN, Role.DISPATCHER], requiredFields: [], sortOrder: 0 },
    ]],
    [STATUS_DISPATCHED.id, [
      { id: 't-200-300', fromStatusId: STATUS_DISPATCHED.id, toStatusId: STATUS_EN_ROUTE.id, label: 'En route', allowedRoles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], requiredFields: [], sortOrder: 0 },
    ]],
    [STATUS_EN_ROUTE.id, [
      { id: 't-300-400', fromStatusId: STATUS_EN_ROUTE.id, toStatusId: STATUS_IN_PROGRESS.id, label: 'Commencer', allowedRoles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], requiredFields: [], sortOrder: 0 },
    ]],
    [STATUS_IN_PROGRESS.id, [
      { id: 't-400-500', fromStatusId: STATUS_IN_PROGRESS.id, toStatusId: STATUS_DONE_POS.id, label: 'Terminer+', allowedRoles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], requiredFields: ['completionNotes'], sortOrder: 0 },
      { id: 't-400-600', fromStatusId: STATUS_IN_PROGRESS.id, toStatusId: STATUS_DONE_NEG.id, label: 'Terminer-', allowedRoles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], requiredFields: ['negativeReason'], sortOrder: 1 },
    ]],
    [STATUS_DONE_POS.id, [
      { id: 't-500-0', fromStatusId: STATUS_DONE_POS.id, toStatusId: STATUS_CREATED.id, label: 'Réouvrir', allowedRoles: [Role.ADMIN], requiredFields: ['reopenReason'], sortOrder: 0 },
    ]],
    [STATUS_DONE_NEG.id, [
      { id: 't-600-0', fromStatusId: STATUS_DONE_NEG.id, toStatusId: STATUS_CREATED.id, label: 'Réouvrir', allowedRoles: [Role.ADMIN], requiredFields: [], sortOrder: 0 },
    ]],
  ]);

  return {
    id: 'proc-1',
    name: 'Standard BT',
    version: 1,
    statuses,
    statusByCode,
    transitions,
    initialStatus: STATUS_CREATED,
    allStatuses: ALL_STATUSES,
  };
}

function makeMockPrisma(woOverrides: Record<string, any> = {}) {
  const wo: Record<string, unknown> = {
    id: 'wo-1',
    status: WorkOrderStatus.EN_ROUTE,
    currentStepId: STATUS_EN_ROUTE.id,
    processDefinitionId: 'proc-1',
    taskTypeId: null as string | null,
    assignedToId: 'tech-1',
    actualStartTime: null as Date | null,
    updatedAt: new Date('2026-05-01T10:00:00.000Z'),
    ...woOverrides,
  };

  return {
    workOrder: {
      findUnique: jest.fn().mockResolvedValue(wo),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...wo, ...data }),
      ),
      $transaction: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ role: 'TECHNICIAN', isActive: true }),
    },
    $transaction: jest.fn().mockImplementation((fn: any) =>
      fn({
        workOrder: {
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...wo, ...data })),
        },
      }),
    ),
  };
}

function makeMockCache(process: CachedProcess = buildProcess()) {
  return {
    getProcess: jest.fn().mockResolvedValue(process),
    getProcessForTaskType: jest.fn().mockResolvedValue(process),
    getDefaultProcess: jest.fn().mockResolvedValue(process),
  };
}

function buildService(prisma: any, cache?: any): ProcessEngineService {
  // EventEmitter2 mock — emit() is a no-op for tests.
  const emitterMock = { emit: jest.fn(), emitAsync: jest.fn() };
  return new ProcessEngineService(
    prisma as any,
    (cache ?? makeMockCache()) as any,
    emitterMock as any,
  );
}

// ─── executeTransition tests ──────────────────────────────────────────────────

describe('ProcessEngineService.executeTransition — IDOR check', () => {
  it('blocks TECHNICIAN from transitioning another technician\'s WO', async () => {
    const prisma = makeMockPrisma({ assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await expect(
      svc.executeTransition(
        'wo-1',
        STATUS_IN_PROGRESS.id,
        { id: 'tech-OTHER', role: Role.TECHNICIAN },
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the assigned TECHNICIAN to transition their own WO', async () => {
    const prisma = makeMockPrisma({ currentStepId: STATUS_EN_ROUTE.id, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await expect(
      svc.executeTransition(
        'wo-1',
        STATUS_IN_PROGRESS.id,
        { id: 'tech-1', role: Role.TECHNICIAN },
        {},
      ),
    ).resolves.toBeDefined();
  });
});

describe('ProcessEngineService.executeTransition — NotFoundException', () => {
  it('throws when WO does not exist', async () => {
    const prisma = makeMockPrisma();
    prisma.workOrder.findUnique = jest.fn().mockResolvedValue(null);
    const svc = buildService(prisma);

    await expect(
      svc.executeTransition('non-existing', STATUS_IN_PROGRESS.id, { id: 'admin', role: Role.ADMIN }, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProcessEngineService.executeTransition — targetStepId validation', () => {
  it('throws BadRequestException when targetStepId does not belong to the process', async () => {
    const prisma = makeMockPrisma();
    const svc = buildService(prisma);

    await expect(
      svc.executeTransition('wo-1', 'unknown-step-uuid', { id: 'admin', role: Role.ADMIN }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ProcessEngineService.executeTransition — admin bypass', () => {
  it('ADMIN can execute a transition that is NOT configured (admin bypass)', async () => {
    // Current step: EN_ROUTE (s-300), target: DISPATCHED (s-200) — no back-transition configured
    const prisma = makeMockPrisma({ currentStepId: STATUS_EN_ROUTE.id });
    const svc = buildService(prisma);

    // s-200 (DISPATCHED) exists in the process but no fromStatusId=s-300 → toStatusId=s-200 transition
    await expect(
      svc.executeTransition(
        'wo-1',
        STATUS_DISPATCHED.id,
        { id: 'admin-1', role: Role.ADMIN },
        {},
      ),
    ).resolves.toBeDefined();
  });

  it('non-admin throws BadRequestException when no transition is configured', async () => {
    const prisma = makeMockPrisma({ currentStepId: STATUS_EN_ROUTE.id });
    const svc = buildService(prisma);

    await expect(
      svc.executeTransition(
        'wo-1',
        STATUS_DISPATCHED.id,
        { id: 'tech-1', role: Role.TECHNICIAN },
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('non-admin throws ForbiddenException when role not in allowedRoles', async () => {
    // CREATED → ASSIGNED requires ADMIN or DISPATCHER — not TECHNICIAN
    const prisma = makeMockPrisma({ currentStepId: STATUS_CREATED.id, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    await expect(
      svc.executeTransition(
        'wo-1',
        STATUS_ASSIGNED.id,
        { id: 'tech-1', role: Role.TECHNICIAN },
        { assignedToId: 'tech-1' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ProcessEngineService.executeTransition — required fields', () => {
  it('throws BadRequestException when assignedToId is missing (CREATED → ASSIGNED)', async () => {
    const prisma = makeMockPrisma({ currentStepId: STATUS_CREATED.id, assignedToId: null });
    const svc = buildService(prisma);

    await expect(
      svc.executeTransition(
        'wo-1',
        STATUS_ASSIGNED.id,
        { id: 'admin', role: Role.ADMIN },
        {}, // no assignedToId
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when negativeReason is missing (IN_PROGRESS → COMPLETED_NEGATIVE)', async () => {
    const prisma = makeMockPrisma({ currentStepId: STATUS_IN_PROGRESS.id });
    const svc = buildService(prisma);

    await expect(
      svc.executeTransition(
        'wo-1',
        STATUS_DONE_NEG.id,
        { id: 'tech-1', role: Role.TECHNICIAN },
        {}, // no negativeReason
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when completionNotes is whitespace only', async () => {
    const prisma = makeMockPrisma({ currentStepId: STATUS_IN_PROGRESS.id });
    const svc = buildService(prisma);

    await expect(
      svc.executeTransition(
        'wo-1',
        STATUS_DONE_POS.id,
        { id: 'tech-1', role: Role.TECHNICIAN },
        { completionNotes: '   ' }, // whitespace-only is rejected
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('succeeds when all required fields are provided', async () => {
    const prisma = makeMockPrisma({ currentStepId: STATUS_IN_PROGRESS.id });
    const svc = buildService(prisma);

    await expect(
      svc.executeTransition(
        'wo-1',
        STATUS_DONE_NEG.id,
        { id: 'tech-1', role: Role.TECHNICIAN },
        { negativeReason: 'Client absent' },
      ),
    ).resolves.toBeDefined();
  });
});

describe('ProcessEngineService.executeTransition — optimistic locking', () => {
  it('throws ConflictException when expectedUpdatedAt does not match current updatedAt', async () => {
    const prisma = makeMockPrisma({
      updatedAt: new Date('2026-05-01T10:00:00.000Z'),
    });
    const svc = buildService(prisma);

    await expect(
      svc.executeTransition(
        'wo-1',
        STATUS_IN_PROGRESS.id,
        { id: 'admin', role: Role.ADMIN },
        { expectedUpdatedAt: '2026-05-01T09:00:00.000Z' }, // stale timestamp
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does NOT throw when expectedUpdatedAt matches', async () => {
    const updatedAt = new Date('2026-05-01T10:00:00.000Z');
    const prisma = makeMockPrisma({ updatedAt });
    const svc = buildService(prisma);

    await expect(
      svc.executeTransition(
        'wo-1',
        STATUS_IN_PROGRESS.id,
        { id: 'tech-1', role: Role.TECHNICIAN },
        { expectedUpdatedAt: updatedAt.toISOString() },
      ),
    ).resolves.toBeDefined();
  });
});

describe('ProcessEngineService.executeTransition — side effects', () => {
  it('sets dispatchedAt when target status has isDispatch=true', async () => {
    // Current: ASSIGNED (s-100) → target: DISPATCHED (s-200, isDispatch=true)
    const prisma = makeMockPrisma({ currentStepId: STATUS_ASSIGNED.id, assignedToId: 'tech-1' });
    const svc = buildService(prisma);

    const beforeCall = Date.now();
    await svc.executeTransition(
      'wo-1',
      STATUS_DISPATCHED.id,
      { id: 'admin', role: Role.ADMIN },
      {},
    );

    // Extract the data passed to tx.workOrder.update
    const txFn = prisma.$transaction.mock.calls[0][0];
    const mockTx = { workOrder: { update: jest.fn().mockResolvedValue({}) } };
    await txFn(mockTx);
    const updateData = mockTx.workOrder.update.mock.calls[0][0].data;
    expect(updateData.dispatchedAt).toBeInstanceOf(Date);
    expect(updateData.dispatchedAt.getTime()).toBeGreaterThanOrEqual(beforeCall);
  });

  it('sets actualStartTime when target status has isStart=true AND it was not already set', async () => {
    const prisma = makeMockPrisma({
      currentStepId: STATUS_EN_ROUTE.id,
      actualStartTime: null,
    });
    const svc = buildService(prisma);

    await svc.executeTransition(
      'wo-1',
      STATUS_IN_PROGRESS.id,
      { id: 'tech-1', role: Role.TECHNICIAN },
      {},
    );

    const txFn = prisma.$transaction.mock.calls[0][0];
    const mockTx = { workOrder: { update: jest.fn().mockResolvedValue({}) } };
    await txFn(mockTx);
    const updateData = mockTx.workOrder.update.mock.calls[0][0].data;
    expect(updateData.actualStartTime).toBeInstanceOf(Date);
  });

  it('does NOT overwrite actualStartTime when already set', async () => {
    const existingStart = new Date('2026-04-30T08:00:00Z');
    const prisma = makeMockPrisma({
      currentStepId: STATUS_EN_ROUTE.id,
      actualStartTime: existingStart,
    });
    const svc = buildService(prisma);

    await svc.executeTransition(
      'wo-1',
      STATUS_IN_PROGRESS.id,
      { id: 'tech-1', role: Role.TECHNICIAN },
      {},
    );

    const txFn = prisma.$transaction.mock.calls[0][0];
    const mockTx = { workOrder: { update: jest.fn().mockResolvedValue({}) } };
    await txFn(mockTx);
    const updateData = mockTx.workOrder.update.mock.calls[0][0].data;
    // actualStartTime should NOT be in the update payload
    expect(updateData).not.toHaveProperty('actualStartTime');
  });

  it('sets actualEndTime when target status has isTerminalPositive=true', async () => {
    const prisma = makeMockPrisma({ currentStepId: STATUS_IN_PROGRESS.id });
    const svc = buildService(prisma);

    await svc.executeTransition(
      'wo-1',
      STATUS_DONE_POS.id,
      { id: 'tech-1', role: Role.TECHNICIAN },
      { completionNotes: 'Done' },
    );

    const txFn = prisma.$transaction.mock.calls[0][0];
    const mockTx = { workOrder: { update: jest.fn().mockResolvedValue({}) } };
    await txFn(mockTx);
    const updateData = mockTx.workOrder.update.mock.calls[0][0].data;
    expect(updateData.actualEndTime).toBeInstanceOf(Date);
  });

  it('resets all timestamps and disconnects technician when target is isInitial=true', async () => {
    // COMPLETED_NEGATIVE (s-600) → CREATED (s-0, isInitial=true)
    const prisma = makeMockPrisma({
      status: WorkOrderStatus.COMPLETED_NEGATIVE,
      currentStepId: STATUS_DONE_NEG.id,
    });
    const svc = buildService(prisma);

    await svc.executeTransition(
      'wo-1',
      STATUS_CREATED.id,
      { id: 'admin', role: Role.ADMIN },
      {},
    );

    const txFn = prisma.$transaction.mock.calls[0][0];
    const mockTx = { workOrder: { update: jest.fn().mockResolvedValue({}) } };
    await txFn(mockTx);
    const updateData = mockTx.workOrder.update.mock.calls[0][0].data;
    expect(updateData.actualStartTime).toBeNull();
    expect(updateData.actualEndTime).toBeNull();
    expect(updateData.dispatchedAt).toBeNull();
    expect(updateData.completionNotes).toBeNull();
    expect(updateData.negativeReason).toBeNull();
    expect(updateData.assignedTo).toEqual({ disconnect: true });
  });

  it('payload assignedToId overrides the disconnect in isInitial reset', async () => {
    // Reopening and immediately re-assigning
    const prisma = makeMockPrisma({
      status: WorkOrderStatus.COMPLETED_NEGATIVE,
      currentStepId: STATUS_DONE_NEG.id,
    });
    // Allow the user validation for the new technician
    prisma.user.findUnique = jest.fn().mockResolvedValue({ role: 'TECHNICIAN', isActive: true });
    const svc = buildService(prisma);

    await svc.executeTransition(
      'wo-1',
      STATUS_CREATED.id,
      { id: 'admin', role: Role.ADMIN },
      { assignedToId: 'new-tech' },
    );

    const txFn = prisma.$transaction.mock.calls[0][0];
    const mockTx = { workOrder: { update: jest.fn().mockResolvedValue({}) } };
    await txFn(mockTx);
    const updateData = mockTx.workOrder.update.mock.calls[0][0].data;
    // connect should win over disconnect
    expect(updateData.assignedTo).toEqual({ connect: { id: 'new-tech' } });
  });
});

// ─── getAvailableTransitions tests ───────────────────────────────────────────

describe('ProcessEngineService.getAvailableTransitions — IDOR', () => {
  it('throws ForbiddenException for TECHNICIAN trying to view another user\'s WO', async () => {
    const prisma = makeMockPrisma({ assignedToId: 'tech-1', currentStepId: STATUS_EN_ROUTE.id });
    const svc = buildService(prisma);

    await expect(
      svc.getAvailableTransitions('wo-1', { id: 'tech-OTHER', role: Role.TECHNICIAN }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ProcessEngineService.getAvailableTransitions — no currentStepId', () => {
  it('returns empty transitions when WO has no currentStepId', async () => {
    const prisma = makeMockPrisma({ currentStepId: null });
    const svc = buildService(prisma);

    const result = await svc.getAvailableTransitions('wo-1', { id: 'admin', role: Role.ADMIN });

    expect(result.transitions).toHaveLength(0);
    expect(result.currentStepId).toBeNull();
  });
});

describe('ProcessEngineService.getAvailableTransitions — ADMIN bypass', () => {
  it('ADMIN receives adminBypass=true', async () => {
    const prisma = makeMockPrisma({ currentStepId: STATUS_EN_ROUTE.id });
    const svc = buildService(prisma);

    const result = await svc.getAvailableTransitions('wo-1', { id: 'admin', role: Role.ADMIN });
    expect(result.adminBypass).toBe(true);
  });

  it('ADMIN receives bypass entries for statuses not reachable via configured transitions', async () => {
    // From EN_ROUTE there is only one configured transition (→ IN_PROGRESS).
    // All other statuses should appear as bypass transitions.
    const prisma = makeMockPrisma({ currentStepId: STATUS_EN_ROUTE.id });
    const svc = buildService(prisma);

    const result = await svc.getAvailableTransitions('wo-1', { id: 'admin', role: Role.ADMIN });

    // Should include the configured transition + bypass entries for the other 5 statuses
    // (total 7 statuses - 1 current = 6 reachable; 1 configured + 5 bypass = 6)
    expect(result.transitions.length).toBe(6);

    // The configured transition label should not start with '[Admin]'
    const configured = result.transitions.find((t) => t.label === 'Commencer');
    expect(configured).toBeDefined();

    // Bypass transitions should have a label starting with '[Admin]'
    const bypass = result.transitions.filter((t) => t.label.startsWith('[Admin]'));
    expect(bypass).toHaveLength(5);
  });
});

describe('ProcessEngineService.getAvailableTransitions — role filtering', () => {
  it('TECHNICIAN only sees transitions where their role is allowed', async () => {
    // From DISPATCHED: one transition (→ EN_ROUTE) with TECHNICIAN allowed
    const prisma = makeMockPrisma({ currentStepId: STATUS_DISPATCHED.id });
    const svc = buildService(prisma);

    const result = await svc.getAvailableTransitions('wo-1', { id: 'tech-1', role: Role.TECHNICIAN });

    expect(result.adminBypass).toBe(false);
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].label).toBe('En route');
  });

  it('DISPATCHER does not see ADMIN-only transitions (e.g., reopen COMPLETED_POSITIVE)', async () => {
    const prisma = makeMockPrisma({ currentStepId: STATUS_DONE_POS.id });
    const svc = buildService(prisma);

    const result = await svc.getAvailableTransitions('wo-1', { id: 'disp-1', role: Role.DISPATCHER });
    // The reopen transition only allows ADMIN
    expect(result.transitions).toHaveLength(0);
  });
});

// ─── mapToLegacyStatus tests ─────────────────────────────────────────────────

describe('ProcessEngineService.mapToLegacyStatus', () => {
  let svc: ProcessEngineService;

  beforeEach(() => {
    svc = buildService(makeMockPrisma());
  });

  it('isInitial → CREATED', () => {
    expect(svc.mapToLegacyStatus(STATUS_CREATED)).toBe(WorkOrderStatus.CREATED);
  });

  it('isDispatch → DISPATCHED', () => {
    expect(svc.mapToLegacyStatus(STATUS_DISPATCHED)).toBe(WorkOrderStatus.DISPATCHED);
  });

  it('isStart → IN_PROGRESS', () => {
    expect(svc.mapToLegacyStatus(STATUS_IN_PROGRESS)).toBe(WorkOrderStatus.IN_PROGRESS);
  });

  it('isTerminalPositive → COMPLETED_POSITIVE', () => {
    expect(svc.mapToLegacyStatus(STATUS_DONE_POS)).toBe(WorkOrderStatus.COMPLETED_POSITIVE);
  });

  it('isTerminalNegative → COMPLETED_NEGATIVE', () => {
    expect(svc.mapToLegacyStatus(STATUS_DONE_NEG)).toBe(WorkOrderStatus.COMPLETED_NEGATIVE);
  });

  it('code=100 → ASSIGNED (code-based heuristic)', () => {
    expect(svc.mapToLegacyStatus(STATUS_ASSIGNED)).toBe(WorkOrderStatus.ASSIGNED);
  });

  it('code=300 → EN_ROUTE (code-based heuristic)', () => {
    expect(svc.mapToLegacyStatus(STATUS_EN_ROUTE)).toBe(WorkOrderStatus.EN_ROUTE);
  });

  it('unknown status returns null', () => {
    const unknown = makeStatus({ id: 'custom', code: 999, name: 'Custom' });
    expect(svc.mapToLegacyStatus(unknown)).toBeNull();
  });
});
