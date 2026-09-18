import type { WorkOrderStatus } from '@taskmgr/shared';

/** Field states that justify background collection (ADR-017 §3). */
export const TRACKING_STATUSES: ReadonlySet<WorkOrderStatus> = new Set<WorkOrderStatus>(['EN_ROUTE', 'IN_PROGRESS']);

export interface TrackingInputs {
  /** Server consent (`preferences.gps.enabled`). */
  serverConsent: boolean;
  /** OS permission actually granted. */
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  /** Statuses of the technician's locally projected work orders. */
  statuses: WorkOrderStatus[];
  /** Set after a 403 on the batch endpoint until the consent is re-enabled. */
  consentRevoked: boolean;
}

export type TrackingDecision = 'off' | 'foreground' | 'background';

/**
 * Pure decision : no consent, no permission, no active work order → off.
 * « While using » permission → foreground fixes only ; « Always » → background task.
 */
export function decideTracking(i: TrackingInputs): TrackingDecision {
  if (!i.serverConsent || i.consentRevoked || !i.foregroundGranted) return 'off';
  if (!i.statuses.some((st) => TRACKING_STATUSES.has(st))) return 'off';
  return i.backgroundGranted ? 'background' : 'foreground';
}
