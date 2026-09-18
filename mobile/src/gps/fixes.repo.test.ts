/**
 * @jest-environment node
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as s from '../db/schema';
import type { AppDb } from '../db/types';
import { bufferFixes, countFixes, deleteFixes, nextBatch } from './fixes.repo';

function openDb(): AppDb {
  const db = drizzle(new Database(':memory:'), { schema: s });
  migrate(db, { migrationsFolder: './drizzle' });
  return db as unknown as AppDb;
}
const fix = (i: number, source: 'MOBILE_FOREGROUND' | 'MOBILE_BACKGROUND' = 'MOBILE_BACKGROUND') =>
  ({ id: `f${i}`, latitude: 45 + i / 1000, longitude: -73, accuracy: 5, recordedAt: new Date(1_700_000_000_000 + i * 1000).toISOString(), source });

describe('location fixes buffer (B38.8)', () => {
  it('buffers, dedups on recordedAt, serves oldest-first batches of 100 and deletes sent rows', async () => {
    const db = openDb();
    await bufferFixes(db, [fix(2), fix(1), { ...fix(1), id: 'dup' }]);
    expect(await countFixes(db)).toBe(2);
    expect((await nextBatch(db)).map((f) => f.id)).toEqual(['f1', 'f2']);
    await bufferFixes(db, Array.from({ length: 150 }, (_, i) => fix(10 + i)));
    const batch = await nextBatch(db);
    expect(batch).toHaveLength(100);
    expect(batch[0].id).toBe('f1');
    await deleteFixes(db, batch.map((f) => f.id));
    expect(await countFixes(db)).toBe(52);
  });
});
