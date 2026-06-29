/**
 * QA — tenant-scope.middleware.spec.ts (B6.4)
 *
 * Locks the auto-injection contract :
 *   1. No tenant in context → middleware is a no-op (cron / startup)
 *   2. Non-tenant model (Tenant, SystemConfig) → no-op
 *   3. findFirst / findMany / count / aggregate / update / delete →
 *      where.tenantId injected
 *   4. create → data.tenantId injected
 *   5. createMany → every row gets tenantId
 *   6. upsert → where + create both get tenantId
 *   7. findUnique with mismatched row → returns null (cross-tenant
 *      leak via PK is blocked)
 *   8. findUnique with matching row → passes through
 *   9. Explicit data.tenantId is not overridden (system caller wins)
 */

import type { Prisma } from '@prisma/client';
import { buildTenantScopeMiddleware } from './tenant-scope.middleware';

function makeContext(tenantId: string | null) {
  return {
    current: jest.fn(() =>
      tenantId === null ? null : { tenantId, userId: null },
    ),
  };
}

type Params = Parameters<Prisma.Middleware>[0];

function makeParams(overrides: Partial<Params>): Params {
  return {
    model: 'WorkOrder',
    action: 'findMany',
    args: {},
    dataPath: [],
    runInTransaction: false,
    ...overrides,
  } as Params;
}

describe('buildTenantScopeMiddleware', () => {
  it('is a no-op when no tenant is in context', async () => {
    const ctx = makeContext(null);
    const mw = buildTenantScopeMiddleware(ctx as never);
    const next = jest.fn().mockResolvedValue([{ id: '1' }]);
    const params = makeParams({ args: { where: { status: 'CREATED' } } });

    await mw(params, next);

    // args.where untouched — no tenantId injected.
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        args: { where: { status: 'CREATED' } },
      }),
    );
  });

  it('skips models that are not tenant-scoped (Tenant, SystemConfig)', async () => {
    const ctx = makeContext('t-1');
    const mw = buildTenantScopeMiddleware(ctx as never);
    const next = jest.fn().mockResolvedValue([]);

    await mw(makeParams({ model: 'Tenant', args: {} }), next);
    expect(next).toHaveBeenLastCalledWith(
      expect.objectContaining({ args: {} }),
    );

    await mw(makeParams({ model: 'SystemConfig', args: {} }), next);
    expect(next).toHaveBeenLastCalledWith(
      expect.objectContaining({ args: {} }),
    );
  });

  it('injects where.tenantId on findMany', async () => {
    const ctx = makeContext('t-1');
    const mw = buildTenantScopeMiddleware(ctx as never);
    const next = jest.fn().mockResolvedValue([]);

    await mw(makeParams({ action: 'findMany', args: {} }), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        args: { where: { tenantId: 't-1' } },
      }),
    );
  });

  it('merges with an existing where clause', async () => {
    const ctx = makeContext('t-1');
    const mw = buildTenantScopeMiddleware(ctx as never);
    const next = jest.fn().mockResolvedValue([]);

    await mw(
      makeParams({
        action: 'findMany',
        args: { where: { status: 'CREATED' } },
      }),
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        args: { where: { status: 'CREATED', tenantId: 't-1' } },
      }),
    );
  });

  it('injects where.tenantId on every where-using action', async () => {
    const ctx = makeContext('t-1');
    const mw = buildTenantScopeMiddleware(ctx as never);
    const next = jest.fn().mockResolvedValue(0);

    const actions: Prisma.PrismaAction[] = [
      'findFirst',
      'findFirstOrThrow',
      'count',
      'aggregate',
      'groupBy',
      'update',
      'updateMany',
      'delete',
      'deleteMany',
    ];

    for (const action of actions) {
      next.mockClear();
      await mw(makeParams({ action, args: { where: {} } }), next);
      const call = next.mock.calls[0][0] as Params;
      expect((call.args as { where: Record<string, string> }).where.tenantId).toBe('t-1');
    }
  });

  it('injects data.tenantId on create', async () => {
    const ctx = makeContext('t-1');
    const mw = buildTenantScopeMiddleware(ctx as never);
    const next = jest.fn().mockResolvedValue({});

    await mw(
      makeParams({ action: 'create', args: { data: { title: 'X' } } }),
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        args: { data: { title: 'X', tenantId: 't-1' } },
      }),
    );
  });

  it('does NOT overwrite an explicit data.tenantId (system caller wins)', async () => {
    const ctx = makeContext('t-1');
    const mw = buildTenantScopeMiddleware(ctx as never);
    const next = jest.fn().mockResolvedValue({});

    await mw(
      makeParams({
        action: 'create',
        args: { data: { title: 'X', tenantId: 'EXPLICIT' } },
      }),
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        args: { data: { title: 'X', tenantId: 'EXPLICIT' } },
      }),
    );
  });

  it('injects tenantId on every row of createMany', async () => {
    const ctx = makeContext('t-1');
    const mw = buildTenantScopeMiddleware(ctx as never);
    const next = jest.fn().mockResolvedValue({ count: 2 });

    await mw(
      makeParams({
        action: 'createMany',
        args: { data: [{ title: 'A' }, { title: 'B', tenantId: 'X' }] },
      }),
      next,
    );

    const call = next.mock.calls[0][0] as Params;
    expect((call.args as { data: Array<{ tenantId: string }> }).data).toEqual([
      { title: 'A', tenantId: 't-1' },
      { title: 'B', tenantId: 'X' },
    ]);
  });

  it('upsert : injects where.tenantId AND create.tenantId', async () => {
    const ctx = makeContext('t-1');
    const mw = buildTenantScopeMiddleware(ctx as never);
    const next = jest.fn().mockResolvedValue({});

    await mw(
      makeParams({
        action: 'upsert',
        args: {
          where: { id: 'abc' },
          create: { title: 'X' },
          update: { title: 'Y' },
        },
      }),
      next,
    );

    const call = next.mock.calls[0][0] as Params;
    const args = call.args as {
      where: Record<string, string>;
      create: Record<string, string>;
    };
    expect(args.where.tenantId).toBe('t-1');
    expect(args.create.tenantId).toBe('t-1');
  });

  it('findUnique : returns null when the returned row is from another tenant', async () => {
    const ctx = makeContext('t-1');
    const mw = buildTenantScopeMiddleware(ctx as never);
    const next = jest.fn().mockResolvedValue({ id: 'wo-1', tenantId: 't-OTHER' });

    const result = await mw(
      makeParams({ action: 'findUnique', args: { where: { id: 'wo-1' } } }),
      next,
    );

    expect(result).toBeNull();
  });

  it('findUnique : passes through when the row belongs to the current tenant', async () => {
    const ctx = makeContext('t-1');
    const mw = buildTenantScopeMiddleware(ctx as never);
    const row = { id: 'wo-1', tenantId: 't-1', title: 'X' };
    const next = jest.fn().mockResolvedValue(row);

    const result = await mw(
      makeParams({ action: 'findUnique', args: { where: { id: 'wo-1' } } }),
      next,
    );

    expect(result).toEqual(row);
  });

  it('findUnique : passes null through unchanged', async () => {
    const ctx = makeContext('t-1');
    const mw = buildTenantScopeMiddleware(ctx as never);
    const next = jest.fn().mockResolvedValue(null);

    const result = await mw(
      makeParams({ action: 'findUnique', args: { where: { id: 'wo-1' } } }),
      next,
    );

    expect(result).toBeNull();
  });

  it('findUniqueOrThrow : throws when the returned row belongs to another tenant', async () => {
    const ctx = makeContext('t-1');
    const mw = buildTenantScopeMiddleware(ctx as never);
    const next = jest.fn().mockResolvedValue({ id: 'wo-1', tenantId: 't-OTHER' });

    await expect(
      mw(
        makeParams({
          action: 'findUniqueOrThrow',
          args: { where: { id: 'wo-1' } },
        }),
        next,
      ),
    ).rejects.toThrow(/No User found/);
  });
});
