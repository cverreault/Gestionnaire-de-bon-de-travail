import { asc, inArray } from 'drizzle-orm';
import * as s from '../db/schema';
import type { AppDb } from '../db/types';

export const LOCATION_BATCH_MAX = 100;

export interface LocalFix {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
  source: 'MOBILE_FOREGROUND' | 'MOBILE_BACKGROUND';
}

export async function bufferFixes(db: AppDb, fixes: LocalFix[]): Promise<void> {
  if (fixes.length === 0) return;
  // Same-second duplicates are rejected server-side anyway (unique technician + recordedAt).
  const seen = new Set<string>();
  const rows = fixes.filter((f) => (seen.has(f.recordedAt) ? false : (seen.add(f.recordedAt), true)));
  await db.insert(s.locationFixes).values(rows).onConflictDoNothing();
}

/** Oldest fixes first, at most one server batch. */
export async function nextBatch(db: AppDb): Promise<LocalFix[]> {
  const rows = await db.select().from(s.locationFixes).orderBy(asc(s.locationFixes.recordedAt)).limit(LOCATION_BATCH_MAX);
  return rows.map((r) => ({ ...r, source: r.source as LocalFix['source'] }));
}

export async function deleteFixes(db: AppDb, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(s.locationFixes).where(inArray(s.locationFixes.id, ids));
}

export async function clearFixes(db: AppDb): Promise<void> {
  await db.delete(s.locationFixes);
}

export async function countFixes(db: AppDb): Promise<number> {
  return (await db.select({ id: s.locationFixes.id }).from(s.locationFixes)).length;
}
