import { inArray, notInArray, sql } from 'drizzle-orm';
import type { SyncPullResponse } from '@taskmgr/shared';
import * as s from '../db/schema';
import { META, setMeta, wipeServerTables } from '../db/repo';
import type { AppDb } from '../db/types';

/**
 * Applies one page of GET /api/me/sync to the local tables (ADR-016 §1).
 * Pure with respect to HTTP : testable on better-sqlite3.
 *
 *  - fullResync → server tables wiped first
 *  - work orders in the page → upsert ; ids absent from visibleWorkOrderIds → deleted
 *  - snapshots / parts → upsert (catalog rows turned inactive are kept, flagged)
 *  - cursor stored last, so a crash mid-page just replays the page
 */
export async function applyPull(db: AppDb, page: SyncPullResponse): Promise<{ upserted: number; deleted: number }> {
  if (page.fullResync) await wipeServerTables(db);

  let upserted = 0;
  for (const wo of page.workOrders) {
    await db
      .insert(s.workOrders)
      .values({
        id: wo.id,
        referenceNumber: wo.referenceNumber,
        title: wo.title,
        status: wo.status,
        currentStepId: wo.currentStepId,
        processDefinitionId: wo.processDefinitionId,
        scheduledDate: wo.scheduledDate,
        scheduledStartTime: wo.scheduledStartTime,
        updatedAt: wo.updatedAt,
        json: JSON.stringify(wo),
      })
      .onConflictDoUpdate({
        target: s.workOrders.id,
        set: {
          referenceNumber: sql`excluded.reference_number`,
          title: sql`excluded.title`,
          status: sql`excluded.status`,
          currentStepId: sql`excluded.current_step_id`,
          processDefinitionId: sql`excluded.process_definition_id`,
          scheduledDate: sql`excluded.scheduled_date`,
          scheduledStartTime: sql`excluded.scheduled_start_time`,
          updatedAt: sql`excluded.updated_at`,
          json: sql`excluded.json`,
        },
      });
    upserted += 1;
  }

  // Deletions by set difference : reassignment and ageing-out (no tombstones).
  let deleted = 0;
  if (page.visibleWorkOrderIds.length === 0) {
    const gone = await db.select({ id: s.workOrders.id }).from(s.workOrders);
    deleted = gone.length;
    if (deleted > 0) await db.delete(s.workOrders);
  } else {
    const gone = await db.select({ id: s.workOrders.id }).from(s.workOrders).where(notInArray(s.workOrders.id, page.visibleWorkOrderIds));
    deleted = gone.length;
    if (deleted > 0) await db.delete(s.workOrders).where(inArray(s.workOrders.id, gone.map((g) => g.id)));
  }

  for (const snap of Object.values(page.processSnapshots)) {
    await db
      .insert(s.processSnapshots)
      .values({ id: snap.id, version: snap.version, updatedAt: snap.updatedAt, json: JSON.stringify(snap) })
      .onConflictDoUpdate({ target: s.processSnapshots.id, set: { version: sql`excluded.version`, updatedAt: sql`excluded.updated_at`, json: sql`excluded.json` } });
  }
  for (const tpl of Object.values(page.templates ?? {})) {
    await db
      .insert(s.templates)
      .values({ id: tpl.id, updatedAt: tpl.updatedAt, json: JSON.stringify(tpl) })
      .onConflictDoUpdate({ target: s.templates.id, set: { updatedAt: sql`excluded.updated_at`, json: sql`excluded.json` } });
  }
  for (const p of page.partsCatalog) {
    await db
      .insert(s.partsCatalog)
      .values({ id: p.id, sku: p.sku, nameFr: p.nameFr || p.name, nameEn: p.nameEn || p.name, unit: p.unit, isActive: p.isActive, updatedAt: p.updatedAt })
      .onConflictDoUpdate({
        target: s.partsCatalog.id,
        set: { sku: sql`excluded.sku`, nameFr: sql`excluded.name_fr`, nameEn: sql`excluded.name_en`, unit: sql`excluded.unit`, isActive: sql`excluded.is_active`, updatedAt: sql`excluded.updated_at` },
      });
  }
  for (const st of page.partsStock) {
    await db
      .insert(s.partsStock)
      .values({ partId: st.partId, quantity: st.quantity, updatedAt: st.updatedAt })
      .onConflictDoUpdate({ target: s.partsStock.partId, set: { quantity: sql`excluded.quantity`, updatedAt: sql`excluded.updated_at` } });
  }

  if (page.cursor) await setMeta(db, META.cursor, page.cursor);
  if (!page.hasMore) await setMeta(db, META.lastSyncAt, page.serverTime);
  return { upserted, deleted };
}

export type PageFetcher = (cursor: string | null, limit: number) => Promise<SyncPullResponse>;

/** Pulls every page until `hasMore` is false. Returns the number of pages applied. */
export async function pullAll(db: AppDb, fetchPage: PageFetcher, startCursor: string | null, limit = 50, maxPages = 50): Promise<number> {
  let cursor = startCursor;
  let pages = 0;
  for (;;) {
    const page = await fetchPage(cursor, limit);
    await applyPull(db, page);
    pages += 1;
    if (!page.hasMore || pages >= maxPages) return pages;
    cursor = page.cursor;
  }
}
