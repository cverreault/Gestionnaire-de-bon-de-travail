/**
 * Delta sync protocol of the mobile app (ADR-016 §1). Constants and the
 * opaque cursor codec live in `common/` so the `mobile` module (server) and,
 * mirrored in `@taskmgr/shared`, the app agree on the wire format.
 */
export const SYNC_PAGE_DEFAULT = 50;
export const SYNC_PAGE_MAX = 200;
/** Completed work orders stay visible this long after their last change. */
export const SYNC_COMPLETED_VISIBLE_DAYS = 14;
/** A cursor older than this forces a full resync (retention of local rows). */
export const SYNC_CURSOR_MAX_AGE_DAYS = 30;

export interface SyncCursor {
  /** Cursor format version. */
  v: 1;
  /** `updatedAt` of the last row of the previous page, ISO 8601. */
  t: string;
  /** `id` of that row (tie-breaker of the keyset). */
  id: string;
}

export function encodeSyncCursor(c: { t: Date | string; id: string }): string {
  const payload: SyncCursor = { v: 1, t: typeof c.t === 'string' ? c.t : c.t.toISOString(), id: c.id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Returns null when the cursor is missing, malformed or of another version. */
export function decodeSyncCursor(raw: string | undefined | null): SyncCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<SyncCursor>;
    if (parsed.v !== 1 || typeof parsed.t !== 'string' || typeof parsed.id !== 'string') return null;
    if (Number.isNaN(new Date(parsed.t).getTime())) return null;
    return { v: 1, t: parsed.t, id: parsed.id };
  } catch {
    return null;
  }
}
