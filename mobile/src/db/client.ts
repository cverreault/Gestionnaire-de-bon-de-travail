import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../../drizzle/migrations';
import * as schema from './schema';
import type { AppDb } from './types';

/** Single app-wide SQLite handle (B38.4). Migrations run once at startup (see RootLayout). */
const expo = openDatabaseSync('dispatch2go.db');
export const db = drizzle(expo, { schema }) as unknown as AppDb;

export function useDbReady(): { ready: boolean; error: Error | undefined } {
  const { success, error } = useMigrations(drizzle(expo, { schema }), migrations);
  return { ready: success, error };
}
