import { asc, eq, like, or, sql } from 'drizzle-orm';
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

export interface CatalogRow {
  id: string;
  sku: string;
  nameFr: string;
  nameEn: string;
  unit: string;
  isActive: boolean;
}

/** Active catalog rows matching sku / name (case-insensitive contains), 30 max. */
export async function searchCatalog(db: AppDb, query: string): Promise<CatalogRow[]> {
  const q = `%${query.trim().toLowerCase()}%`;
  const base = db.select({ id: s.partsCatalog.id, sku: s.partsCatalog.sku, nameFr: s.partsCatalog.nameFr, nameEn: s.partsCatalog.nameEn, unit: s.partsCatalog.unit, isActive: s.partsCatalog.isActive }).from(s.partsCatalog);
  const rows = query.trim()
    ? await base.where(or(like(sql`lower(${s.partsCatalog.sku})`, q), like(sql`lower(${s.partsCatalog.nameFr})`, q), like(sql`lower(${s.partsCatalog.nameEn})`, q))).orderBy(asc(s.partsCatalog.sku)).limit(30)
    : await base.orderBy(asc(s.partsCatalog.sku)).limit(30);
  return rows.filter((r) => r.isActive);
}

/** Exact SKU match (barcode scan), active only. */
export async function findCatalogBySku(db: AppDb, sku: string): Promise<CatalogRow | null> {
  const rows = await db.select().from(s.partsCatalog).where(eq(sql`lower(${s.partsCatalog.sku})`, sku.trim().toLowerCase()));
  const r = rows[0];
  return r && r.isActive ? { id: r.id, sku: r.sku, nameFr: r.nameFr, nameEn: r.nameEn, unit: r.unit, isActive: r.isActive } : null;
}

export interface StockRow extends CatalogRow {
  quantity: number;
}

/** The technician's truck stock joined with the catalog. */
export async function listMyStock(db: AppDb): Promise<StockRow[]> {
  const rows = await db
    .select({ id: s.partsCatalog.id, sku: s.partsCatalog.sku, nameFr: s.partsCatalog.nameFr, nameEn: s.partsCatalog.nameEn, unit: s.partsCatalog.unit, isActive: s.partsCatalog.isActive, quantity: s.partsStock.quantity })
    .from(s.partsStock)
    .innerJoin(s.partsCatalog, eq(s.partsCatalog.id, s.partsStock.partId))
    .orderBy(asc(s.partsCatalog.sku));
  return rows;
}
