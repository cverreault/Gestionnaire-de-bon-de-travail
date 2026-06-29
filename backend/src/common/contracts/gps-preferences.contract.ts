/**
 * Convention for opt-in GPS tracking (B5).
 *
 * Stored in `User.preferences` JSON under the `gps` key. We don't
 * promote this to a top-level Prisma column because the value is
 * effectively a single boolean per user — the existing `preferences`
 * JSONB is the right home, consistent with theme/locale/columns.
 *
 *   {
 *     "theme": "dark",
 *     "locale": "fr",
 *     "gps": { "enabled": true }
 *   }
 *
 * The backend treats absent / `false` as DISABLED (no fall-back to
 * tracking by default). Even when enabled, the technician's browser
 * has the final say via the OS-level location permission prompt.
 */

export const GPS_PREFERENCES_KEY = 'gps' as const;

export interface GpsPreferences {
  /** Tech has opted in to live position tracking. Default: false. */
  enabled: boolean;
}

export function isGpsEnabled(
  preferences: unknown,
): boolean {
  if (!preferences || typeof preferences !== 'object') return false;
  const gps = (preferences as Record<string, unknown>)[GPS_PREFERENCES_KEY];
  if (!gps || typeof gps !== 'object') return false;
  return (gps as GpsPreferences).enabled === true;
}
