/**
 * Codes d'erreur métier renvoyés par le backend que le client mobile doit
 * reconnaître (ADR-016). Miroir manuel de `backend/src/common/contracts/`.
 */

/** 409 sur une mutation dont `expectedUpdatedAt` ne correspond plus à la ligne. */
export const OPTIMISTIC_LOCK_CONFLICT = 'OPTIMISTIC_LOCK_CONFLICT' as const;

/** 422 : même `Idempotency-Key` réutilisée avec un corps différent. */
export const IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED' as const;

/** 409 : une requête portant cette `Idempotency-Key` est encore en cours. */
export const IDEMPOTENCY_IN_PROGRESS = 'IDEMPOTENCY_IN_PROGRESS' as const;

/** En-tête porté par chaque mutation rejouable depuis la file hors ligne. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key' as const;

/** En-tête d'identification de l'installation (ADR-014 §4). */
export const DEVICE_ID_HEADER = 'X-Device-Id' as const;

export interface OptimisticLockConflictBody {
  code: typeof OPTIMISTIC_LOCK_CONFLICT;
  currentUpdatedAt: string;
  expectedUpdatedAt: string;
}
