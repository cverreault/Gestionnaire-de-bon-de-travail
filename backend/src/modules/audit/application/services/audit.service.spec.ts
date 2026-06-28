/**
 * QA — audit.service.spec.ts
 *
 * Locks AuditService behaviour as we keep adding admin tooling on top:
 *  - record() is idempotent by eventId (P2002 swallowed) and never throws
 *  - findRecentForAggregate() enforces object-level RBAC for TECHNICIAN
 *  - findAllPaginated() honours every filter combination of the DTO
 *  - exportCsv() shares filter logic, caps at 5000 rows, hydrates actor
 *  - findAllPaginated() + exportCsv() actor hydration matches users.findMany
 *
 * Prisma is mocked end-to-end. The model methods exposed match exactly what
 * the service touches, so adding a new query path will fail the build
 * instead of silently returning undefined.
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditService, type AuditListOpts } from './audit.service';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

type AuditRow = {
  id: string;
  eventName: string;
  aggregateId: string;
  occurredAt: Date;
  actorUserId: string | null;
  data: Record<string, unknown> | null;
  createdAt: Date;
};

interface MockUserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN';
}

interface MockWorkOrderRow {
  assignedToId: string | null;
}

function applyAuditWhere(rows: AuditRow[], where: Record<string, unknown>): AuditRow[] {
  return rows.filter((r) => {
    if (where.eventName && r.eventName !== where.eventName) return false;
    if (where.aggregateId && r.aggregateId !== where.aggregateId) return false;
    if (where.actorUserId && r.actorUserId !== where.actorUserId) return false;
    if (where.occurredAt) {
      const { gte, lte } = where.occurredAt as { gte?: Date; lte?: Date };
      if (gte && r.occurredAt < gte) return false;
      if (lte && r.occurredAt > lte) return false;
    }
    return true;
  });
}

function makeMockPrisma(opts: {
  auditRows?: AuditRow[];
  users?: MockUserRow[];
  workOrders?: Record<string, MockWorkOrderRow>;
} = {}) {
  const auditRows: AuditRow[] = [...(opts.auditRows ?? [])];
  const users: MockUserRow[] = [...(opts.users ?? [])];
  const workOrders = { ...(opts.workOrders ?? {}) };

  return {
    auditLog: {
      create: jest.fn(({ data }: { data: AuditRow }) => {
        if (auditRows.find((r) => r.id === data.id)) {
          // Simulate Prisma's unique-violation behavior
          const err = new Error('Unique constraint failed') as Error & { code?: string };
          err.code = 'P2002';
          return Promise.reject(err);
        }
        auditRows.push(data);
        return Promise.resolve(data);
      }),
      findMany: jest.fn((args: { where?: Record<string, unknown>; skip?: number; take?: number }) => {
        let rows = applyAuditWhere(auditRows, args.where ?? {});
        // Order DESC by occurredAt — same as service
        rows = [...rows].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
        if (args.skip) rows = rows.slice(args.skip);
        if (args.take !== undefined) rows = rows.slice(0, args.take);
        return Promise.resolve(rows);
      }),
      count: jest.fn((args: { where?: Record<string, unknown> }) =>
        Promise.resolve(applyAuditWhere(auditRows, args.where ?? {}).length),
      ),
    },
    user: {
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) => {
        return Promise.resolve(users.filter((u) => where.id.in.includes(u.id)));
      }),
    },
    workOrder: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(workOrders[where.id] ?? null),
      ),
    },
    $transaction: jest.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
    _state: { auditRows, users },
  };
}

function buildService(prisma: any) {
  return new AuditService(prisma as any);
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeAuditRow(o: Partial<AuditRow> = {}): AuditRow {
  return {
    id: 'evt-' + Math.random().toString(36).slice(2, 10),
    eventName: 'workOrders.workOrder.created',
    aggregateId: 'wo-1',
    occurredAt: new Date('2026-06-01T10:00:00Z'),
    actorUserId: 'user-1',
    data: { foo: 'bar' },
    createdAt: new Date('2026-06-01T10:00:01Z'),
    ...o,
  };
}

// ─── record() ────────────────────────────────────────────────────────────────

describe('AuditService.record', () => {
  it('persists the event with full metadata', async () => {
    const prisma = makeMockPrisma();
    const svc = buildService(prisma);

    await svc.record({
      name: 'workOrders.workOrder.assigned',
      eventId: 'evt-abc',
      aggregateId: 'wo-1',
      occurredAt: new Date('2026-06-15T12:00:00Z'),
      actorUserId: 'user-1',
      data: { technicianId: 'tech-1' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma._state.auditRows).toHaveLength(1);
    expect(prisma._state.auditRows[0]).toMatchObject({
      id: 'evt-abc',
      eventName: 'workOrders.workOrder.assigned',
      aggregateId: 'wo-1',
      actorUserId: 'user-1',
    });
  });

  it('is idempotent: re-recording the same eventId is silently dropped', async () => {
    const prisma = makeMockPrisma({
      auditRows: [makeAuditRow({ id: 'evt-duplicate' })],
    });
    const svc = buildService(prisma);

    // Should NOT throw — P2002 is swallowed.
    await expect(svc.record({
      name: 'workOrders.workOrder.created',
      eventId: 'evt-duplicate',
      aggregateId: 'wo-1',
      occurredAt: new Date(),
      actorUserId: null,
      data: {},
    })).resolves.toBeUndefined();

    expect(prisma._state.auditRows).toHaveLength(1);
  });
});

// ─── findRecentForAggregate() ────────────────────────────────────────────────

describe('AuditService.findRecentForAggregate', () => {
  const ADMIN = { id: 'admin-1', role: 'ADMIN' as const };
  const DISPATCHER = { id: 'disp-1', role: 'DISPATCHER' as const };
  const TECH_OWN = { id: 'tech-1', role: 'TECHNICIAN' as const };
  const TECH_OTHER = { id: 'tech-2', role: 'TECHNICIAN' as const };

  it('returns the timeline hydrated with actor info (admin)', async () => {
    const prisma = makeMockPrisma({
      auditRows: [
        makeAuditRow({ id: 'a', occurredAt: new Date('2026-06-01T09:00:00Z'), actorUserId: 'u-1' }),
        makeAuditRow({ id: 'b', occurredAt: new Date('2026-06-01T10:00:00Z'), actorUserId: 'u-1' }),
      ],
      users: [{ id: 'u-1', firstName: 'Alice', lastName: 'Doe', email: 'a@x.io', role: 'ADMIN' }],
    });
    const svc = buildService(prisma);

    const rows = await svc.findRecentForAggregate('wo-1', ADMIN as any);

    expect(rows).toHaveLength(2);
    // Newest first
    expect(rows[0].id).toBe('b');
    expect(rows[0].actor).toMatchObject({ id: 'u-1', firstName: 'Alice' });
  });

  it('lets DISPATCHER read any aggregate (no ownership check)', async () => {
    const prisma = makeMockPrisma({
      auditRows: [makeAuditRow({ aggregateId: 'wo-other' })],
      workOrders: {}, // workOrder lookup not called for dispatcher
    });
    const svc = buildService(prisma);

    const rows = await svc.findRecentForAggregate('wo-other', DISPATCHER as any);
    expect(rows).toHaveLength(1);
    expect(prisma.workOrder.findUnique).not.toHaveBeenCalled();
  });

  it('lets TECHNICIAN read their own BT', async () => {
    const prisma = makeMockPrisma({
      auditRows: [makeAuditRow({ aggregateId: 'wo-1' })],
      workOrders: { 'wo-1': { assignedToId: 'tech-1' } },
    });
    const svc = buildService(prisma);

    const rows = await svc.findRecentForAggregate('wo-1', TECH_OWN as any);
    expect(rows).toHaveLength(1);
    expect(prisma.workOrder.findUnique).toHaveBeenCalledWith({
      where: { id: 'wo-1' },
      select: { assignedToId: true },
    });
  });

  it("blocks TECHNICIAN from reading another tech's BT (403)", async () => {
    const prisma = makeMockPrisma({
      auditRows: [makeAuditRow({ aggregateId: 'wo-1' })],
      workOrders: { 'wo-1': { assignedToId: 'tech-1' } },
    });
    const svc = buildService(prisma);

    await expect(svc.findRecentForAggregate('wo-1', TECH_OTHER as any))
      .rejects.toThrow(ForbiddenException);
  });

  it('returns 404 when the aggregate does not exist (TECHNICIAN)', async () => {
    const prisma = makeMockPrisma({
      auditRows: [],
      workOrders: {}, // workOrder unknown
    });
    const svc = buildService(prisma);

    await expect(svc.findRecentForAggregate('wo-ghost', TECH_OWN as any))
      .rejects.toThrow(NotFoundException);
  });
});

// ─── findAllPaginated() ──────────────────────────────────────────────────────

describe('AuditService.findAllPaginated', () => {
  const seedRows = [
    makeAuditRow({ id: '1', eventName: 'workOrders.workOrder.created',       occurredAt: new Date('2026-06-01T10:00:00Z'), actorUserId: 'u-1', aggregateId: 'wo-1' }),
    makeAuditRow({ id: '2', eventName: 'workOrders.workOrder.assigned',      occurredAt: new Date('2026-06-02T10:00:00Z'), actorUserId: 'u-2', aggregateId: 'wo-1' }),
    makeAuditRow({ id: '3', eventName: 'workOrders.workOrder.statusChanged', occurredAt: new Date('2026-06-03T10:00:00Z'), actorUserId: 'u-1', aggregateId: 'wo-2' }),
    makeAuditRow({ id: '4', eventName: 'workOrders.workOrder.completed',     occurredAt: new Date('2026-06-04T10:00:00Z'), actorUserId: null,  aggregateId: 'wo-2' }),
  ];
  const seedUsers: MockUserRow[] = [
    { id: 'u-1', firstName: 'Alice', lastName: 'Admin',    email: 'a@x.io', role: 'ADMIN' },
    { id: 'u-2', firstName: 'Dave',  lastName: 'Disp',     email: 'd@x.io', role: 'DISPATCHER' },
  ];

  it('returns newest first, paginated, with hydrated actor info', async () => {
    const prisma = makeMockPrisma({ auditRows: seedRows, users: seedUsers });
    const svc = buildService(prisma);

    const result = await svc.findAllPaginated({ page: 1, limit: 2 });

    expect(result.meta).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
    expect(result.data.map((r) => r.id)).toEqual(['4', '3']);
    // Row 4 has no actor — actor is null, no row in users.findMany lookup
    expect(result.data[0].actor).toBeNull();
    expect(result.data[1].actor).toMatchObject({ id: 'u-1', firstName: 'Alice' });
  });

  it('filters by eventName', async () => {
    const prisma = makeMockPrisma({ auditRows: seedRows, users: seedUsers });
    const svc = buildService(prisma);

    const result = await svc.findAllPaginated({
      eventName: 'workOrders.workOrder.assigned',
    });

    expect(result.meta.total).toBe(1);
    expect(result.data[0].id).toBe('2');
  });

  it('filters by aggregateId', async () => {
    const prisma = makeMockPrisma({ auditRows: seedRows, users: seedUsers });
    const svc = buildService(prisma);

    const result = await svc.findAllPaginated({ aggregateId: 'wo-2' });

    expect(result.meta.total).toBe(2);
    expect(new Set(result.data.map((r) => r.id))).toEqual(new Set(['3', '4']));
  });

  it('filters by actorUserId (excludes anonymous events)', async () => {
    const prisma = makeMockPrisma({ auditRows: seedRows, users: seedUsers });
    const svc = buildService(prisma);

    const result = await svc.findAllPaginated({ actorUserId: 'u-1' });

    expect(result.meta.total).toBe(2);
    expect(new Set(result.data.map((r) => r.id))).toEqual(new Set(['1', '3']));
  });

  it('filters by from/to date range', async () => {
    const prisma = makeMockPrisma({ auditRows: seedRows, users: seedUsers });
    const svc = buildService(prisma);

    const result = await svc.findAllPaginated({
      from: new Date('2026-06-02T00:00:00Z'),
      to:   new Date('2026-06-03T23:59:59Z'),
    });

    expect(result.meta.total).toBe(2);
    expect(new Set(result.data.map((r) => r.id))).toEqual(new Set(['2', '3']));
  });

  it('clamps page to >=1 and limit to <=200', async () => {
    const prisma = makeMockPrisma({ auditRows: seedRows, users: seedUsers });
    const svc = buildService(prisma);

    const tooSmall = await svc.findAllPaginated({ page: 0 });
    expect(tooSmall.meta.page).toBe(1);

    const tooBig = await svc.findAllPaginated({ limit: 999 });
    expect(tooBig.meta.limit).toBe(200);
  });
});

// ─── exportCsv() ─────────────────────────────────────────────────────────────

describe('AuditService.exportCsv', () => {
  it('returns CSV with the same filters as findAllPaginated (BOM, headers, JSON payload)', async () => {
    const rows = [
      makeAuditRow({
        id: 'evt-1',
        eventName: 'workOrders.workOrder.assigned',
        occurredAt: new Date('2026-06-15T10:00:00Z'),
        actorUserId: 'u-1',
        data: { technicianId: 'tech-1' },
      }),
    ];
    const prisma = makeMockPrisma({
      auditRows: rows,
      users: [{ id: 'u-1', firstName: 'Alice', lastName: 'Admin', email: 'a@x.io', role: 'ADMIN' }],
    });
    const svc = buildService(prisma);

    const csv = await svc.exportCsv({ eventName: 'workOrders.workOrder.assigned' } as AuditListOpts);

    // BOM
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    // Header row
    expect(csv).toContain('Quand,Événement,Agrégat,Acteur,Acteur email,Acteur rôle,Payload,Enregistré le');
    // Data row
    expect(csv).toContain('workOrders.workOrder.assigned');
    expect(csv).toContain('Alice Admin');
    expect(csv).toContain('a@x.io');
    expect(csv).toContain('ADMIN');
    // JSON payload quoted because of the comma in JSON
    expect(csv).toContain('"{""technicianId"":""tech-1""}"');
  });

  it('caps at 5000 rows', async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeAuditRow({ id: `evt-${i}`, occurredAt: new Date(`2026-06-${String(i + 1).padStart(2, '0')}T10:00:00Z`) })
    );
    const prisma = makeMockPrisma({ auditRows: rows, users: [] });
    const svc = buildService(prisma);

    await svc.exportCsv({});

    const findManyArgs = (prisma.auditLog.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyArgs.take).toBe(5000);
    expect(findManyArgs.orderBy).toEqual({ occurredAt: 'desc' });
  });

  it('writes "Système" when actorUserId is null', async () => {
    const prisma = makeMockPrisma({
      auditRows: [makeAuditRow({ id: 'evt-sys', actorUserId: null, data: null })],
      users: [],
    });
    const svc = buildService(prisma);

    const csv = await svc.exportCsv({});
    expect(csv).toContain('Système');
  });
});
