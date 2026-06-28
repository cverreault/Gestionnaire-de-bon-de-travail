/**
 * QA — sla-check.service.spec.ts
 *
 * Locks the SLA breach detection contract:
 *   1. Active BTs past their target → slaBreachedAt set + event emitted
 *   2. Completed BTs are NEVER touched (late completion ≠ active breach)
 *   3. Already-breached BTs are skipped (idempotent if cron runs twice)
 *   4. BTs without a slaTargetAt are ignored (the type has no SLA)
 *   5. Future-target BTs are ignored
 *   6. Event payload carries slaTargetAt, detectedAt, slaHours, assignedToId
 *   7. A row failure logs but doesn't abort the batch (per-row try/catch)
 */

import { WorkOrderStatus } from '@prisma/client';
import { SlaCheckService } from './sla-check.service';
import { WO_EVENT_NAMES } from './domain/events/work-order-events';

interface WoRow {
  id: string;
  slaTargetAt: Date | null;
  slaBreachedAt: Date | null;
  status: WorkOrderStatus;
  assignedToId: string | null;
  taskTypeId: string | null;
}

interface TaskTypeRow {
  id: string;
  slaHours: number | null;
}

function makeMockPrisma(opts: {
  workOrders: WoRow[];
  taskTypes?: TaskTypeRow[];
} = { workOrders: [] }) {
  const wos = [...opts.workOrders];
  const types = [...(opts.taskTypes ?? [])];

  return {
    _wos: wos,
    workOrder: {
      findMany: jest.fn(({ where, take, orderBy: _o }: any) => {
        let rows = wos.filter((w) => {
          if (where.slaTargetAt?.lt && (!w.slaTargetAt || w.slaTargetAt >= where.slaTargetAt.lt)) return false;
          if (where.slaBreachedAt === null && w.slaBreachedAt !== null) return false;
          if (where.status?.notIn) {
            if (where.status.notIn.includes(w.status)) return false;
          }
          return true;
        });
        rows = [...rows].sort((a, b) => (a.slaTargetAt?.getTime() ?? 0) - (b.slaTargetAt?.getTime() ?? 0));
        if (take) rows = rows.slice(0, take);
        // Project the selected shape — caller asks for id/slaTargetAt/assignedToId/taskTypeId.
        return Promise.resolve(rows.map((w) => ({
          id: w.id,
          slaTargetAt: w.slaTargetAt,
          assignedToId: w.assignedToId,
          taskTypeId: w.taskTypeId,
        })));
      }),
      update: jest.fn(({ where, data }: any) => {
        const w = wos.find((x) => x.id === where.id);
        if (!w) return Promise.reject(new Error('not found'));
        Object.assign(w, data);
        return Promise.resolve(w);
      }),
    },
    taskType: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(types.filter((t) => where.id.in.includes(t.id))),
      ),
    },
  };
}

function makeMockEmitter() {
  return { emit: jest.fn() } as any;
}

function buildService(prisma: any, emitter = makeMockEmitter()) {
  return new SlaCheckService(prisma as any, emitter as any);
}

function makeWo(o: Partial<WoRow>): WoRow {
  return {
    id: 'wo-' + Math.random().toString(36).slice(2, 8),
    slaTargetAt: null,
    slaBreachedAt: null,
    status: WorkOrderStatus.ASSIGNED,
    assignedToId: null,
    taskTypeId: null,
    ...o,
  };
}

const now = Date.now();
const ONE_HOUR = 60 * 60 * 1000;

describe('SlaCheckService.runOnce', () => {
  it('marks active BTs past target as breached and emits the event', async () => {
    const prisma = makeMockPrisma({
      workOrders: [
        makeWo({
          id: 'wo-1',
          slaTargetAt: new Date(now - ONE_HOUR),
          status: WorkOrderStatus.ASSIGNED,
          assignedToId: 'tech-1',
          taskTypeId: 'type-A',
        }),
      ],
      taskTypes: [{ id: 'type-A', slaHours: 48 }],
    });
    const emitter = makeMockEmitter();
    const svc = buildService(prisma, emitter);

    const processed = await svc.runOnce();

    expect(processed).toBe(1);
    expect(prisma._wos[0].slaBreachedAt).toBeInstanceOf(Date);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
    const [name, payload] = (emitter.emit as jest.Mock).mock.calls[0];
    expect(name).toBe(WO_EVENT_NAMES.SLA_BREACHED);
    expect(payload).toMatchObject({
      name: WO_EVENT_NAMES.SLA_BREACHED,
      aggregateId: 'wo-1',
      actorUserId: null,
      data: {
        slaHours: 48,
        assignedToId: 'tech-1',
      },
    });
    expect(typeof payload.data.slaTargetAt).toBe('string');
    expect(typeof payload.data.detectedAt).toBe('string');
  });

  it('does NOT touch completed BTs (late completion is not an active breach)', async () => {
    const prisma = makeMockPrisma({
      workOrders: [
        makeWo({
          id: 'late-positive',
          slaTargetAt: new Date(now - ONE_HOUR),
          status: WorkOrderStatus.COMPLETED_POSITIVE,
        }),
        makeWo({
          id: 'late-negative',
          slaTargetAt: new Date(now - ONE_HOUR),
          status: WorkOrderStatus.COMPLETED_NEGATIVE,
        }),
      ],
    });
    const emitter = makeMockEmitter();
    const svc = buildService(prisma, emitter);

    const processed = await svc.runOnce();
    expect(processed).toBe(0);
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('does NOT re-process already-breached BTs (idempotent across cron firings)', async () => {
    const prisma = makeMockPrisma({
      workOrders: [
        makeWo({
          id: 'already',
          slaTargetAt: new Date(now - 2 * ONE_HOUR),
          slaBreachedAt: new Date(now - ONE_HOUR),
          status: WorkOrderStatus.IN_PROGRESS,
        }),
      ],
    });
    const emitter = makeMockEmitter();
    const svc = buildService(prisma, emitter);

    expect(await svc.runOnce()).toBe(0);
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('ignores BTs without a slaTargetAt (no SLA configured)', async () => {
    const prisma = makeMockPrisma({
      workOrders: [makeWo({ slaTargetAt: null })],
    });
    const emitter = makeMockEmitter();
    const svc = buildService(prisma, emitter);

    expect(await svc.runOnce()).toBe(0);
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('ignores BTs whose target is still in the future', async () => {
    const prisma = makeMockPrisma({
      workOrders: [makeWo({ slaTargetAt: new Date(now + ONE_HOUR) })],
    });
    const emitter = makeMockEmitter();
    const svc = buildService(prisma, emitter);

    expect(await svc.runOnce()).toBe(0);
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('continues processing the rest of the batch when one row update fails', async () => {
    const prisma = makeMockPrisma({
      workOrders: [
        makeWo({ id: 'wo-ok',  slaTargetAt: new Date(now - ONE_HOUR) }),
        makeWo({ id: 'wo-bad', slaTargetAt: new Date(now - ONE_HOUR) }),
      ],
    });
    const emitter = makeMockEmitter();
    const svc = buildService(prisma, emitter);

    (prisma.workOrder.update as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('boom')),
    );

    // Silence the error log so the test output stays readable.
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation(() => undefined);

    const processed = await svc.runOnce();
    expect(processed).toBe(1);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
  });

  it('returns 0 (no work) when no rows match', async () => {
    const prisma = makeMockPrisma({ workOrders: [] });
    const svc = buildService(prisma);
    expect(await svc.runOnce()).toBe(0);
  });
});
