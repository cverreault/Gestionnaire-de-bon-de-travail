import { asc, eq } from 'drizzle-orm';
import type { ProcessSnapshot, SyncWorkOrder } from '@taskmgr/shared';
import * as s from './schema';
import type { AppDb } from './types';

export const META = {
  cursor: 'sync.cursor',
  lastSyncAt: 'sync.lastSyncAt',
  ownerUserId: 'owner.userId',
} as const;

export async function getMeta(db: AppDb, key: string): Promise<string | null> {
  const rows = await db.select().from(s.meta).where(eq(s.meta.key, key));
  return rows[0]?.value ?? null;
}

export async function setMeta(db: AppDb, key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.delete(s.meta).where(eq(s.meta.key, key));
    return;
  }
  await db.insert(s.meta).values({ key, value }).onConflictDoUpdate({ target: s.meta.key, set: { value } });
}

export async function listWorkOrders(db: AppDb): Promise<SyncWorkOrder[]> {
  const rows = await db.select({ json: s.workOrders.json }).from(s.workOrders).orderBy(asc(s.workOrders.scheduledDate), asc(s.workOrders.referenceNumber));
  return rows.map((r) => JSON.parse(r.json) as SyncWorkOrder);
}

export async function getWorkOrder(db: AppDb, id: string): Promise<SyncWorkOrder | null> {
  const rows = await db.select({ json: s.workOrders.json }).from(s.workOrders).where(eq(s.workOrders.id, id));
  return rows[0] ? (JSON.parse(rows[0].json) as SyncWorkOrder) : null;
}

export async function getSnapshot(db: AppDb, id: string | null | undefined): Promise<ProcessSnapshot | null> {
  if (!id) return null;
  const rows = await db.select({ json: s.processSnapshots.json }).from(s.processSnapshots).where(eq(s.processSnapshots.id, id));
  return rows[0] ? (JSON.parse(rows[0].json) as ProcessSnapshot) : null;
}

/** Wipes every server-owned table (fullResync or user change). Keeps `meta` except the sync keys. */
export async function wipeServerTables(db: AppDb): Promise<void> {
  await db.delete(s.workOrders);
  await db.delete(s.processSnapshots);
  await db.delete(s.partsCatalog);
  await db.delete(s.partsStock);
  await setMeta(db, META.cursor, null);
  await setMeta(db, META.lastSyncAt, null);
}

/** A different user on the same install must never see the previous one's data. */
export async function ensureOwner(db: AppDb, userId: string): Promise<boolean> {
  const current = await getMeta(db, META.ownerUserId);
  if (current === userId) return false;
  await wipeServerTables(db);
  await setMeta(db, META.ownerUserId, userId);
  return true;
}
