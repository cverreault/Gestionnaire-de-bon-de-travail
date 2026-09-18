import type { Config } from 'drizzle-kit';

/** Local SQLite schema of the app (B38.4). `npm run db:generate` after editing src/db/schema.ts. */
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
