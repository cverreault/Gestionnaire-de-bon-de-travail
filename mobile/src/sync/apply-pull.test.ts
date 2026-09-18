/**
 * @jest-environment node
 *
 * better-sqlite3 is a native addon : it must load in the plain Node
 * environment, not in jest-expo's React Native VM context (SIGSEGV on CI).
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { SyncPullResponse, SyncWorkOrder } from '@taskmgr/shared';
import * as schema from '../db/schema';
import { META, ensureOwner, getMeta, getSnapshot, getWorkOrder, listWorkOrders } from '../db/repo';
import { applyPull, pullAll } from './apply-pull';
import type { AppDb } from '../db/types';

function openTestDb(): AppDb {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './drizzle' });
  return db as unknown as AppDb;
}

function wo(id: string, updatedAt: string, extra: Partial<SyncWorkOrder> = {}): SyncWorkOrder {
  return {
    id, referenceNumber: `R-${id}`, status: 'ASSIGNED', type: 'OTHER', title: `T ${id}`, description: null, priority: 0,
    clientAddress: null, externalClientName: null, processDefinitionId: 'proc', currentStepId: 's100', assignedToId: 'me',
    scheduledDate: null, scheduledStartTime: null, scheduledEndTime: null, actualStartTime: null, actualEndTime: null,
    completionNotes: null, negativeReason: null, hasSignatureClient: false, hasSignatureTechnician: false, signedAt: null,
    templateData: null, dispatchedAt: null, createdAt: updatedAt, updatedAt, client: null, principalClient: null,
    clientAddress_rel: null, taskType: null, currentStep: null, notes: [], attachments: [], parts: [], ...extra,
  };
}

function page(p: Partial<SyncPullResponse>): SyncPullResponse {
  return {
    cursor: 'c1', hasMore: false, fullResync: false, serverTime: '2026-09-18T12:00:00Z',
    visibleWorkOrderIds: [], workOrders: [], processSnapshots: {}, partsStock: [], partsCatalog: [], ...p,
  };
}

describe('applyPull (ADR-016 §1, B38.4)', () => {
  it('upserts work orders, snapshots and parts, then stores the cursor', async () => {
    const db = openTestDb();
    const snap = { id: 'proc', name: 'Standard BT', version: 1, updatedAt: '2026-09-01T00:00:00Z', statuses: [], transitions: [] };
    const out = await applyPull(db, page({
      fullResync: true, visibleWorkOrderIds: ['a', 'b'], workOrders: [wo('a', '2026-09-18T10:00:00Z'), wo('b', '2026-09-18T11:00:00Z')],
      processSnapshots: { proc: snap },
      partsCatalog: [{ id: 'p1', sku: 'SKU1', name: 'Vis', nameFr: 'Vis', nameEn: 'Screw', unit: 'un', isActive: true, updatedAt: '2026-09-01T00:00:00Z' }],
      partsStock: [{ id: 'st1', partId: 'p1', quantity: 4, updatedAt: '2026-09-01T00:00:00Z' }],
    }));
    expect(out).toEqual({ upserted: 2, deleted: 0 });
    expect((await listWorkOrders(db)).map((w) => w.id)).toEqual(['a', 'b']);
    expect(await getSnapshot(db, 'proc')).toEqual(snap);
    expect(await getMeta(db, META.cursor)).toBe('c1');
    expect(await getMeta(db, META.lastSyncAt)).toBe('2026-09-18T12:00:00Z');

    // update in place : the row keeps one copy with the new body
    await applyPull(db, page({ visibleWorkOrderIds: ['a', 'b'], workOrders: [wo('a', '2026-09-18T12:30:00Z', { title: 'changed' })], cursor: 'c2' }));
    expect((await getWorkOrder(db, 'a'))?.title).toBe('changed');
    expect((await listWorkOrders(db)).length).toBe(2);
    expect(await getMeta(db, META.cursor)).toBe('c2');
  });

  it('deletes rows missing from the visible set (reassignment) and everything when the set is empty', async () => {
    const db = openTestDb();
    await applyPull(db, page({ fullResync: true, visibleWorkOrderIds: ['a', 'b'], workOrders: [wo('a', '1'), wo('b', '1')] }));
    const out = await applyPull(db, page({ visibleWorkOrderIds: ['a'] }));
    expect(out.deleted).toBe(1);
    expect((await listWorkOrders(db)).map((w) => w.id)).toEqual(['a']);
    await applyPull(db, page({ visibleWorkOrderIds: [] }));
    expect(await listWorkOrders(db)).toEqual([]);
  });

  it('fullResync wipes local server tables before applying', async () => {
    const db = openTestDb();
    await applyPull(db, page({ fullResync: true, visibleWorkOrderIds: ['old'], workOrders: [wo('old', '1')], processSnapshots: { p0: { id: 'p0', name: 'x', version: 1, updatedAt: '1', statuses: [], transitions: [] } } }));
    await applyPull(db, page({ fullResync: true, visibleWorkOrderIds: ['new'], workOrders: [wo('new', '2')] }));
    expect((await listWorkOrders(db)).map((w) => w.id)).toEqual(['new']);
    expect(await getSnapshot(db, 'p0')).toBeNull();
  });

  it('does not stamp lastSyncAt until the last page, and pullAll follows hasMore', async () => {
    const db = openTestDb();
    const pages: SyncPullResponse[] = [
      page({ fullResync: true, hasMore: true, cursor: 'c1', visibleWorkOrderIds: ['a', 'b'], workOrders: [wo('a', '1')] }),
      page({ hasMore: false, cursor: 'c2', visibleWorkOrderIds: ['a', 'b'], workOrders: [wo('b', '2')] }),
    ];
    const seen: Array<string | null> = [];
    const n = await pullAll(db, async (cursor) => { seen.push(cursor); return pages.shift()!; }, null);
    expect(n).toBe(2);
    expect(seen).toEqual([null, 'c1']);
    expect((await listWorkOrders(db)).map((w) => w.id)).toEqual(['a', 'b']);
    expect(await getMeta(db, META.lastSyncAt)).toBe('2026-09-18T12:00:00Z');
  });

  it('ensureOwner wipes the data when another user logs in on the same install', async () => {
    const db = openTestDb();
    expect(await ensureOwner(db, 'u1')).toBe(true);
    await applyPull(db, page({ visibleWorkOrderIds: ['a'], workOrders: [wo('a', '1')] }));
    expect(await ensureOwner(db, 'u1')).toBe(false);
    expect(await listWorkOrders(db)).toHaveLength(1);
    expect(await ensureOwner(db, 'u2')).toBe(true);
    expect(await listWorkOrders(db)).toHaveLength(0);
    expect(await getMeta(db, META.cursor)).toBeNull();
  });
});
