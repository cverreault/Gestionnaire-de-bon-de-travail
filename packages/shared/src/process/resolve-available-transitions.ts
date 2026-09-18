import type { ProcessSnapshot, ProcessSnapshotTransition } from '../contracts/sync';

/**
 * ADR-016 §7 — available transitions computed on the device from a process
 * snapshot, so a technician can chain steps offline. Pure ; the server
 * re-validates every replayed transition.
 */
export function resolveAvailableTransitions(
  snapshot: ProcessSnapshot | null | undefined,
  currentStepId: string | null | undefined,
  role: string,
): ProcessSnapshotTransition[] {
  if (!snapshot || !currentStepId) return [];
  return snapshot.transitions
    .filter((t) => t.fromStatusId === currentStepId && t.allowedRoles.includes(role))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

/** Label in the user's language, falling back to the legacy `label`. */
export function transitionLabel(t: ProcessSnapshotTransition, locale: 'fr' | 'en'): string {
  const l = locale === 'en' ? t.labelEn : t.labelFr;
  return l && l.trim() ? l : t.label;
}
