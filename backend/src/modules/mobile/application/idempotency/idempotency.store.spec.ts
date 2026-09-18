import { Prisma } from '@prisma/client';
import { IdempotencyStore } from './idempotency.store';

const SCOPE = { tenantId: 't-1', userId: 'u-1' };
const REQ = { key: 'k-1', method: 'POST', path: '/api/x', requestHash: 'h1' };

function make(existing: Record<string, unknown> | null, createFails = false) {
  const p2002 = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
  const prisma = {
    idempotencyKey: {
      create: createFails ? jest.fn().mockRejectedValue(p2002) : jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
  };
  return { store: new IdempotencyStore(prisma as never), prisma };
}

describe('IdempotencyStore (B37.5)', () => {
  it('claims a new key with an INSERT', async () => {
    const { store, prisma } = make(null);
    await expect(store.begin(SCOPE, REQ)).resolves.toEqual({ state: 'NEW' });
    expect(prisma.idempotencyKey.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ...SCOPE, key: 'k-1', requestHash: 'h1', status: 'IN_PROGRESS' }) });
  });

  it('replays a DONE row with the same hash, rejects another hash, reports an in-flight one', async () => {
    const done = { id: 'r', requestHash: 'h1', status: 'DONE', statusCode: 201, responseBody: { id: 'n' }, createdAt: new Date() };
    await expect(make(done, true).store.begin(SCOPE, REQ)).resolves.toEqual({ state: 'DONE', statusCode: 201, body: { id: 'n' } });
    await expect(make({ ...done, requestHash: 'other' }, true).store.begin(SCOPE, REQ)).resolves.toEqual({ state: 'MISMATCH' });
    await expect(make({ ...done, status: 'IN_PROGRESS' }, true).store.begin(SCOPE, REQ)).resolves.toEqual({ state: 'IN_PROGRESS' });
  });

  it('hands a stale IN_PROGRESS claim (crashed request) back to the caller', async () => {
    const stale = { id: 'r', requestHash: 'h1', status: 'IN_PROGRESS', createdAt: new Date(Date.now() - 10 * 60_000) };
    const { store, prisma } = make(stale, true);
    await expect(store.begin(SCOPE, REQ)).resolves.toEqual({ state: 'NEW' });
    expect(prisma.idempotencyKey.update).toHaveBeenCalled();
  });

  it('complete stores status + body, release deletes, cleanup purges by age', async () => {
    const { store, prisma } = make(null);
    await store.complete(SCOPE, 'k-1', 201, { id: 'n' });
    expect(prisma.idempotencyKey.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'DONE', statusCode: 201, responseBody: { id: 'n' } } }));
    await store.release(SCOPE, 'k-1');
    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({ where: { ...SCOPE, key: 'k-1' } });
    await expect(store.cleanup()).resolves.toBe(3);
  });
});
