/**
 * @jest-environment node
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as s from '../db/schema';
import type { AppDb } from '../db/types';
import { drain, retryOp, type Sender } from './drain';
import { countOps, enqueue, listOps } from './queue';

function openDb(): AppDb {
  const db = drizzle(new Database(':memory:'), { schema: s });
  migrate(db, { migrationsFolder: './drizzle' });
  return db as unknown as AppDb;
}

async function seedWo(db: AppDb, id: string, updatedAt = '2026-09-18T10:00:00Z') {
  await db.insert(s.workOrders).values({ id, referenceNumber: `R-${id}`, title: id, status: 'DISPATCHED', currentStepId: 's200', processDefinitionId: 'p', scheduledDate: null, scheduledStartTime: null, updatedAt, json: '{}' });
}

function fakeSender(script: Record<string, Array<unknown>>): Sender & { calls: Array<{ id: string; expected: string | null }> } {
  const calls: Array<{ id: string; expected: string | null }> = [];
  const next = (id: string) => {
    const q = script[id] ?? [];
    const r = q.shift();
    if (r instanceof Error || (r && typeof r === 'object' && 'status' in (r as object))) throw r;
    return r;
  };
  return {
    calls,
    async transition(op, expected) { calls.push({ id: op.id, expected }); return next(op.id) as { updatedAt: string }; },
    async note(op) { calls.push({ id: op.id, expected: null }); return (next(op.id) ?? {}) as { workOrderUpdatedAt?: string }; },
    async attachment(op) { calls.push({ id: op.id, expected: null }); return (next(op.id) ?? {}) as { workOrderUpdatedAt?: string }; },
    async signature(op, expected) { calls.push({ id: op.id, expected }); return next(op.id) as { updatedAt: string }; },
  };
}

describe('drain (ADR-016 §3/§4)', () => {
  it('sends in seq order, feeds updatedAt forward and deletes sent ops', async () => {
    const db = openDb();
    await seedWo(db, 'a');
    await enqueue(db, { id: 't1', workOrderId: 'a', kind: 'transition', payload: { targetStepId: 's300', label: 'x' } });
    await enqueue(db, { id: 'n1', workOrderId: 'a', kind: 'note', payload: { content: 'hi' } });
    await enqueue(db, { id: 't2', workOrderId: 'a', kind: 'transition', payload: { targetStepId: 's400', label: 'y' } });
    const sender = fakeSender({ t1: [{ updatedAt: 'T1' }], n1: [{ workOrderUpdatedAt: 'T2' }], t2: [{ updatedAt: 'T3' }] });
    const pull = jest.fn(async () => {});
    const out = await drain(db, sender, pull);
    expect(out).toEqual({ sent: 3, conflicts: 0, failed: 0, stopped: false });
    expect(sender.calls).toEqual([{ id: 't1', expected: '2026-09-18T10:00:00Z' }, { id: 'n1', expected: null }, { id: 't2', expected: 'T2' }]);
    expect(await listOps(db)).toEqual([]);
    const [row] = await db.select({ u: s.workOrders.updatedAt }).from(s.workOrders);
    expect(row.u).toBe('T3');
  });

  it('409 on a transition → CONFLICT, later ops of that work order blocked, other work orders continue', async () => {
    const db = openDb();
    await seedWo(db, 'a');
    await seedWo(db, 'b');
    await enqueue(db, { id: 't1', workOrderId: 'a', kind: 'transition', payload: { targetStepId: 's300', label: 'x' } });
    await enqueue(db, { id: 'n1', workOrderId: 'a', kind: 'note', payload: { content: 'blocked' } });
    await enqueue(db, { id: 'n2', workOrderId: 'b', kind: 'note', payload: { content: 'ok' } });
    const sender = fakeSender({ t1: [{ status: 409, code: 'OPTIMISTIC_LOCK_CONFLICT', message: 'stale' }], n2: [{}] });
    const pull = jest.fn(async () => {});
    const out = await drain(db, sender, pull);
    expect(pull).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ sent: 1, conflicts: 1 });
    const ops = await listOps(db);
    expect(ops.map((o) => [o.id, o.status])).toEqual([['t1', 'CONFLICT'], ['n1', 'PENDING']]);
    expect(await countOps(db)).toEqual({ pending: 1, failed: 0, conflict: 1 });

    // « apply anyway » : the op goes back to PENDING and the drain resumes with the fresh updatedAt
    await db.update(s.workOrders).set({ updatedAt: 'FRESH' });
    await retryOp(db, 't1');
    const sender2 = fakeSender({ t1: [{ updatedAt: 'T9' }], n1: [{}] });
    await drain(db, sender2, pull);
    expect(sender2.calls[0]).toEqual({ id: 't1', expected: 'FRESH' });
    expect(await listOps(db)).toEqual([]);
  });

  it('409 on a note → pull then retry, FAILED after three tries', async () => {
    const db = openDb();
    await seedWo(db, 'a');
    await enqueue(db, { id: 'n1', workOrderId: 'a', kind: 'note', payload: { content: 'x' } });
    const conflict = { status: 409, code: 'OPTIMISTIC_LOCK_CONFLICT' };
    const okAfterOne = fakeSender({ n1: [conflict, {}] });
    const pull = jest.fn(async () => {});
    expect(await drain(db, okAfterOne, pull)).toMatchObject({ sent: 1 });
    expect(pull).toHaveBeenCalledTimes(1);

    await enqueue(db, { id: 'n2', workOrderId: 'a', kind: 'note', payload: { content: 'y' } });
    const never = fakeSender({ n2: [conflict, conflict, conflict] });
    expect(await drain(db, never, pull)).toMatchObject({ conflicts: 1 });
    expect((await listOps(db))[0]).toMatchObject({ id: 'n2', status: 'CONFLICT', attempts: 3 });
  });

  it('transport / 5xx errors keep the op PENDING and stop the drain ; 4xx marks FAILED', async () => {
    const db = openDb();
    await seedWo(db, 'a');
    await enqueue(db, { id: 'n1', workOrderId: 'a', kind: 'note', payload: { content: 'x' } });
    await enqueue(db, { id: 'n2', workOrderId: 'a', kind: 'note', payload: { content: 'y' } });
    const down = fakeSender({ n1: [{ status: 0, message: 'Network request failed' }] });
    expect(await drain(db, down, async () => {})).toEqual({ sent: 0, conflicts: 0, failed: 0, stopped: true });
    expect((await listOps(db)).map((o) => o.status)).toEqual(['PENDING', 'PENDING']);

    const bad = fakeSender({ n1: [{ status: 400, message: 'invalid' }], n2: [{}] });
    expect(await drain(db, bad, async () => {})).toMatchObject({ sent: 1, failed: 1 });
    expect((await listOps(db)).map((o) => [o.id, o.status, o.lastError])).toEqual([['n1', 'FAILED', 'invalid']]);
  });

  it('signatures are additive : 409 → pull and retry with the fresh updatedAt', async () => {
    const db = openDb();
    await seedWo(db, 'a');
    await enqueue(db, { id: 's1', workOrderId: 'a', kind: 'signature', payload: { signatureClient: 'data:image/png;base64,AAA' } });
    const sender = fakeSender({ s1: [{ status: 409, code: 'OPTIMISTIC_LOCK_CONFLICT' }, { updatedAt: 'T2' }] });
    const pull = jest.fn(async () => { await db.update(s.workOrders).set({ updatedAt: 'FRESH' }); });
    expect(await drain(db, sender, pull)).toMatchObject({ sent: 1, conflicts: 0 });
    expect(sender.calls.map((c) => c.expected)).toEqual(['2026-09-18T10:00:00Z', 'FRESH']);
    expect(await listOps(db)).toEqual([]);
  });
});
