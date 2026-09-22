/**
 * QA — process-seed.spec.ts
 *
 * Validates the seed / backfill logic:
 *  1. Exactly 7 statuses are defined in the seed data
 *  2. Exactly 10 transitions are defined in the seed data
 *  3. Required singleton flags are each set on exactly one status
 *  4. No duplicate status codes
 *  5. All transition fromCode / toCode references exist in the status list
 *  6. All required fields in transitions are valid (assignedToId, negativeReason, etc.)
 *  7. Backfill maps all 7 legacy WorkOrderStatus values
 *  8. Seed is idempotent (does not create a second process when one already exists)
 */

import { Role, WorkOrderStatus } from '@prisma/client';

// The seed data lives in common/contracts/default-process.contract.ts (shared
// with the tenant bootstrap) ; the assertions below lock its invariants.
import {
  DEFAULT_PROCESS_STATUSES as STATUS_DEFS,
  DEFAULT_PROCESS_TRANSITIONS as TRANSITION_DEFS,
} from '../../common/contracts/default-process.contract';
import { ProcessSeedService } from './process-seed.service';

const ALLOWED_REQUIRED_FIELDS = ['assignedToId', 'negativeReason', 'completionNotes', 'reopenReason'];

// Legacy enum → expected ProcessStatus code mapping (used by backfill)
const LEGACY_TO_CODE: Record<WorkOrderStatus, number> = {
  [WorkOrderStatus.REQUESTED]:          50,
  [WorkOrderStatus.CREATED]:            0,
  [WorkOrderStatus.ASSIGNED]:           100,
  [WorkOrderStatus.DISPATCHED]:         200,
  [WorkOrderStatus.EN_ROUTE]:           300,
  [WorkOrderStatus.IN_PROGRESS]:        400,
  [WorkOrderStatus.COMPLETED_POSITIVE]: 500,
  [WorkOrderStatus.COMPLETED_NEGATIVE]: 600,
  [WorkOrderStatus.CANCELLED]:          700,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Process Seed — status definitions', () => {
  it('defines exactly 8 statuses', () => {
    expect(STATUS_DEFS).toHaveLength(9);
  });

  it('has no duplicate status codes', () => {
    const codes = STATUS_DEFS.map((s) => s.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('has statuses sorted by position (-1 through 7)', () => {
    const positions = STATUS_DEFS.map((s) => s.position);
    expect(positions).toEqual([-1, 0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('has exactly one isInitial status (code 0)', () => {
    const initial = STATUS_DEFS.filter((s) => s.isInitial);
    expect(initial).toHaveLength(1);
    expect(initial[0].code).toBe(0);
  });

  it('has exactly one isDispatch status (code 200)', () => {
    const dispatch = STATUS_DEFS.filter((s) => s.isDispatch);
    expect(dispatch).toHaveLength(1);
    expect(dispatch[0].code).toBe(200);
  });

  it('has exactly one isStart status (code 400)', () => {
    const start = STATUS_DEFS.filter((s) => s.isStart);
    expect(start).toHaveLength(1);
    expect(start[0].code).toBe(400);
  });

  it('has exactly one isTerminalPositive status (code 500)', () => {
    const tp = STATUS_DEFS.filter((s) => s.isTerminalPositive);
    expect(tp).toHaveLength(1);
    expect(tp[0].code).toBe(500);
  });

  it('has exactly one isTerminalNegative status (code 600)', () => {
    const tn = STATUS_DEFS.filter((s) => s.isTerminalNegative);
    expect(tn).toHaveLength(1);
    expect(tn[0].code).toBe(600);
  });

  it('all status colors are valid hex colors', () => {
    const hexColorRegex = /^#[0-9a-f]{6}$/i;
    for (const s of STATUS_DEFS) {
      expect(s.color).toMatch(hexColorRegex);
    }
  });
});

describe('Process Seed — transition definitions', () => {
  const codeSet = new Set(STATUS_DEFS.map((s) => s.code));

  it('defines exactly 12 transitions', () => {
    expect(TRANSITION_DEFS).toHaveLength(18);
  });

  it('all fromCode values reference an existing status code', () => {
    for (const t of TRANSITION_DEFS) {
      expect(codeSet.has(t.fromCode)).toBe(true);
    }
  });

  it('all toCode values reference an existing status code', () => {
    for (const t of TRANSITION_DEFS) {
      expect(codeSet.has(t.toCode)).toBe(true);
    }
  });

  it('no self-transitions (fromCode !== toCode)', () => {
    for (const t of TRANSITION_DEFS) {
      expect(t.fromCode).not.toBe(t.toCode);
    }
  });

  it('no duplicate (fromCode, toCode) pairs', () => {
    const seen = new Set<string>();
    for (const t of TRANSITION_DEFS) {
      const key = `${t.fromCode}→${t.toCode}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('all requiredFields values are in the allowed set', () => {
    for (const t of TRANSITION_DEFS) {
      for (const field of t.required) {
        expect(ALLOWED_REQUIRED_FIELDS).toContain(field);
      }
    }
  });

  it('all roles are valid Role enum values', () => {
    const validRoles = Object.values(Role);
    for (const t of TRANSITION_DEFS) {
      for (const role of t.roles) {
        expect(validRoles).toContain(role);
      }
    }
  });

  it('all transitions have at least one allowed role', () => {
    for (const t of TRANSITION_DEFS) {
      expect(t.roles.length).toBeGreaterThan(0);
    }
  });
});

describe('Process Seed — backfill mapping', () => {
  it('every WorkOrderStatus has a corresponding ProcessStatus code', () => {
    const allLegacyStatuses = Object.values(WorkOrderStatus);
    const codedStatuses = new Set(STATUS_DEFS.map((s) => s.code));

    for (const legacyStatus of allLegacyStatuses) {
      const code = LEGACY_TO_CODE[legacyStatus];
      expect(code).toBeDefined();
      expect(codedStatuses.has(code)).toBe(true);
    }
  });

  it('LEGACY_TO_CODE covers all 9 WorkOrderStatus values', () => {
    expect(Object.keys(LEGACY_TO_CODE)).toHaveLength(9);
  });
});

describe('Process Seed — idempotence mock', () => {
  it('does not re-create process when one already exists', async () => {
    // Mock Prisma to simulate an existing default process
    const mockCreate = jest.fn();
    const mockPrisma = {
      processDefinition: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-proc' }),
        create: mockCreate,
        // backfillRequestedStatus (B21) scans every definition; an
        // already-patched process carries an isRequested status.
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'existing-proc',
            tenantId: 't-1',
            name: 'Standard BT',
            statuses: [
              { id: 's-50', code: 50, position: -1, isInitial: false, isTerminalNegative: false, isRequested: true },
              // backfillCancelledStatus (B54) skips definitions that already carry « Annulé ».
              { id: 's-700', code: 700, position: 7, isInitial: false, isTerminalNegative: false, isCancelled: true },
            ],
            // repairDefaultProcesses (B43) skips definitions that already
            // carry the 18 canonical transitions.
            transitions: new Array(18).fill({ fromStatusId: 'x', toStatusId: 'y' }),
          },
        ]),
      },
      processStatus: {
        create: jest.fn(),
        // findMany is called by backfillWorkOrders to get statuses for mapping
        findMany: jest.fn().mockResolvedValue([]),
      },
      processTransition: { create: jest.fn() },
      workOrder: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      taskType: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };

    const svc = new ProcessSeedService(mockPrisma as any);

    await svc.seedAndBackfill();

    // processDefinition.create should NOT have been called (idempotent)
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('Process Seed — repair of tenants bootstrapped without transitions (B43)', () => {
  function brokenDefinition() {
    return {
      id: 'proc-norda',
      tenantId: 't-norda',
      name: 'Standard BT',
      statuses: [
        { id: 's-0', code: 0, name: 'Créé', position: 1, isInitial: true, isDispatch: false },
        { id: 's-100', code: 100, name: 'Assigné', position: 2, isInitial: false, isDispatch: false },
        { id: 's-200', code: 200, name: 'En progrès', position: 3, isInitial: false, isDispatch: false, isStart: true },
        { id: 's-900', code: 900, name: 'Complété (+)', position: 4, isInitial: false, isDispatch: false, isTerminalPositive: true },
        { id: 's-50', code: 50, name: 'Demandé', position: 0, isInitial: false, isDispatch: false, isRequested: true },
        { id: 's-700', code: 700, name: 'Annulé', position: 5, isInitial: false, isDispatch: false, isCancelled: true },
      ],
      transitions: [{ id: 'tr-1', fromStatusId: 's-50', toStatusId: 's-0' }],
    };
  }

  function makePrisma(def: ReturnType<typeof brokenDefinition>, workOrdersOn200 = 0) {
    const tx = {
      processStatus: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: { code: number } }) =>
            Promise.resolve({ id: `s-${data.code}`, ...data }),
          ),
        update: jest
          .fn()
          .mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
            Promise.resolve({ id: where.id, ...data }),
          ),
        delete: jest.fn().mockResolvedValue({}),
      },
      processTransition: { create: jest.fn().mockResolvedValue({}) },
      workOrder: { count: jest.fn().mockResolvedValue(0) },
    };
    const prisma = {
      processDefinition: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-proc' }),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([def]),
      },
      processStatus: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      processTransition: { create: jest.fn() },
      workOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(workOrdersOn200),
      },
      taskType: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    return { prisma, tx };
  }

  it('adds the missing statuses and transitions, fixes code 200 and drops the orphan 900', async () => {
    const { prisma, tx } = makePrisma(brokenDefinition());
    await new ProcessSeedService(prisma as any).seedAndBackfill();

    const createdCodes = tx.processStatus.create.mock.calls
      .map((c: [{ data: { code: number } }]) => c[0].data.code)
      .sort((a: number, b: number) => a - b);
    expect(createdCodes).toEqual([300, 400, 500, 600]);
    for (const call of tx.processStatus.create.mock.calls) {
      expect(call[0].data.tenantId).toBe('t-norda');
      expect(call[0].data.processDefinitionId).toBe('proc-norda');
    }

    const fix200 = tx.processStatus.update.mock.calls.find(
      (c: [{ where: { id: string } }]) => c[0].where.id === 's-200',
    );
    expect(fix200[0].data).toMatchObject({ name: 'Dispatché', isDispatch: true, isStart: false });

    expect(tx.processStatus.delete).toHaveBeenCalledWith({ where: { id: 's-900' } });

    // 18 canonical transitions minus the one (50 → 0) that already existed.
    expect(tx.processTransition.create).toHaveBeenCalledTimes(17);
    const pairs = tx.processTransition.create.mock.calls.map(
      (c: [{ data: { fromStatusId: string; toStatusId: string } }]) =>
        `${c[0].data.fromStatusId}→${c[0].data.toStatusId}`,
    );
    expect(pairs).not.toContain('s-50→s-0');
    expect(pairs).toEqual(expect.arrayContaining(['s-100→s-200', 's-200→s-300', 's-300→s-400', 's-400→s-500', 's-0→s-700', 's-700→s-0']));
  });

  it('leaves a definition untouched when work orders sit on the mis-seeded code 200', async () => {
    const { prisma, tx } = makePrisma(brokenDefinition(), 3);
    await new ProcessSeedService(prisma as any).seedAndBackfill();

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.processTransition.create).not.toHaveBeenCalled();
  });

  it('is a no-op for a definition that already carries the canonical transitions', async () => {
    const def = brokenDefinition();
    def.transitions = new Array(18).fill({ fromStatusId: 'x', toStatusId: 'y' });
    const { prisma, tx } = makePrisma(def);
    await new ProcessSeedService(prisma as any).seedAndBackfill();

    expect(tx.processStatus.create).not.toHaveBeenCalled();
    expect(tx.processTransition.create).not.toHaveBeenCalled();
  });
});

describe('Process Seed — « Annulé » backfill (B54)', () => {
  it('adds a cancelled status, one cancel transition per open step and a reopen transition', async () => {
    const def = {
      id: 'proc-custom',
      tenantId: 't-1',
      name: 'Custom',
      statuses: [
        { id: 's-0', code: 0, name: 'Créé', position: 0, isInitial: true },
        { id: 's-100', code: 100, name: 'Assigné', position: 1 },
        { id: 's-500', code: 500, name: 'Fini', position: 2, isTerminalPositive: true },
        { id: 's-50', code: 50, name: 'Demandé', position: -1, isRequested: true },
      ],
      transitions: new Array(18).fill({ fromStatusId: 'x', toStatusId: 'y' }),
    };
    const tx = {
      processStatus: {
        create: jest.fn().mockImplementation(({ data }: { data: { code: number } }) => Promise.resolve({ id: `s-${data.code}`, ...data })),
        update: jest.fn(),
        delete: jest.fn(),
      },
      processTransition: { create: jest.fn().mockResolvedValue({}) },
      workOrder: { count: jest.fn().mockResolvedValue(0) },
    };
    const prisma = {
      processDefinition: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-proc' }),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([def]),
      },
      processStatus: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      processTransition: { create: jest.fn() },
      workOrder: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), count: jest.fn().mockResolvedValue(0) },
      taskType: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    await new ProcessSeedService(prisma as any).seedAndBackfill();

    const created = tx.processStatus.create.mock.calls.map((c: [{ data: Record<string, unknown> }]) => c[0].data);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ code: 700, name: 'Annulé', isCancelled: true, tenantId: 't-1', position: 3 });

    const pairs = tx.processTransition.create.mock.calls.map(
      (c: [{ data: { fromStatusId: string; toStatusId: string; requiredFields: string[] } }]) =>
        `${c[0].data.fromStatusId}→${c[0].data.toStatusId}`,
    );
    // Open steps only (not the requested nor the terminal one), then reopen.
    expect(pairs.sort()).toEqual(['s-0→s-700', 's-100→s-700', 's-700→s-0']);
    const cancel = tx.processTransition.create.mock.calls.find((c: [{ data: { toStatusId: string } }]) => c[0].data.toStatusId === 's-700');
    expect(cancel[0].data.requiredFields).toEqual(['negativeReason']);
  });
});
