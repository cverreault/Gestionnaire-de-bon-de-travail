/**
 * Domain events of the `users` module consumed by other modules without
 * importing the publisher (ADR-001 §3a).
 */
export const USER_SESSIONS_REVOKED_EVENT = 'users.user.sessionsRevoked' as const;

/**
 * Emitted with `emitAsync` when an admin cuts every session of a user, or
 * when the user is deactivated. `auth` revokes the refresh tokens, `mobile`
 * revokes the registered devices ; both run before the HTTP response.
 */
export interface UserSessionsRevokedPayload {
  tenantId: string;
  userId: string;
  /** Admin who triggered it (null when triggered by deactivation from a system path). */
  actorUserId: string | null;
  reason: 'admin' | 'deactivated';
}

/** What each listener returns so the caller can report counts. */
export interface UserSessionsRevokedResult {
  refreshTokens?: number;
  devices?: number;
}
