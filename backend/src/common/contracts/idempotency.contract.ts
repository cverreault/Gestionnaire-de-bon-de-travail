/**
 * Replay-safe mutations for the mobile app (ADR-016 §3, CLAUDE.md rule 12).
 *
 * The interceptor (`common/interceptors/idempotency.interceptor.ts`) is
 * generic ; the storage is owned by the `mobile` module, which binds this
 * token in a `@Global()` module so any controller marked `@Idempotent()`
 * resolves it without a cross-module import.
 */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key' as const;
export const IDEMPOTENCY_REPLAYED_HEADER = 'Idempotency-Replayed' as const;
export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');
export const IDEMPOTENT_METADATA_KEY = 'idempotent' as const;

/** Error codes (body `code`) the app reacts to. */
export const IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED' as const;
export const IDEMPOTENCY_IN_PROGRESS = 'IDEMPOTENCY_IN_PROGRESS' as const;

/** Keys are kept this long ; replays after that are executed again. */
export const IDEMPOTENCY_TTL_MS = 48 * 60 * 60 * 1000;
/** An IN_PROGRESS row older than this is a crashed request : the key is retried. */
export const IDEMPOTENCY_STALE_MS = 2 * 60 * 1000;

export interface IdempotencyScope {
  tenantId: string;
  userId: string;
}

export interface IdempotencyRequest {
  key: string;
  method: string;
  path: string;
  requestHash: string;
}

export type IdempotencyBegin =
  | { state: 'NEW' }
  | { state: 'IN_PROGRESS' }
  | { state: 'MISMATCH' }
  | { state: 'DONE'; statusCode: number; body: unknown };

export interface IIdempotencyStore {
  /** Claims the key atomically ; tells the caller what to do. */
  begin(scope: IdempotencyScope, req: IdempotencyRequest): Promise<IdempotencyBegin>;
  /** Records the handler's response for future replays. */
  complete(scope: IdempotencyScope, key: string, statusCode: number, body: unknown): Promise<void>;
  /** Drops the claim when the handler failed, so the client may retry. */
  release(scope: IdempotencyScope, key: string): Promise<void>;
}
