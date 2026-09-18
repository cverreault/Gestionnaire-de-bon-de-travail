import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/**
 * Driver-agnostic handle : expo-sqlite in the app, better-sqlite3 in Jest
 * (same schema, same queries — roadmap B38.4). Statements are awaited one
 * by one ; no multi-statement transaction so both drivers behave the same.
 */
export type AppDb = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof schema>;
