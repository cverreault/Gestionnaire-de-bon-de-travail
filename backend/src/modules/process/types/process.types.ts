import { Role } from '@prisma/client';

// ── Cached process structures ─────────────────────────────────────────────────

export interface CachedStatus {
  id: string;
  code: number;
  name: string;
  color: string;
  position: number;
  isInitial: boolean;
  isDispatch: boolean;
  isStart: boolean;
  isTerminalPositive: boolean;
  isTerminalNegative: boolean;
  /** B21 — pre-approval step for client-portal work requests. */
  isRequested: boolean;
}

export interface CachedTransition {
  id: string;
  fromStatusId: string;
  toStatusId: string;
  label: string;
  allowedRoles: Role[];
  requiredFields: string[];
  sortOrder: number;
}

export interface CachedProcess {
  id: string;
  name: string;
  version: number;
  statuses: Map<string, CachedStatus>;         // statusId  → status
  statusByCode: Map<number, CachedStatus>;     // code      → status
  transitions: Map<string, CachedTransition[]>; // fromStatusId → transitions[]
  initialStatus: CachedStatus;
  /** B21 — status flagged isRequested, when the process has one. */
  requestedStatus?: CachedStatus;
  allStatuses: CachedStatus[];                  // ordered by position
}

// ── Engine I/O ────────────────────────────────────────────────────────────────

/**
 * Payload accepted by executeTransition.
 * Fields are validated against the transition's requiredFields list.
 */
export interface TransitionPayload {
  assignedToId?: string;
  negativeReason?: string;
  completionNotes?: string;
  /** Required for re-opening a COMPLETED_POSITIVE work order (audit trail). Not persisted. */
  reopenReason?: string;
  /** ISO-8601 string used for optimistic-lock validation. */
  expectedUpdatedAt?: string;
}

/**
 * Single transition entry returned by getAvailableTransitions.
 */
export interface AvailableTransition {
  id: string;
  toStatusId: string;
  toStatusCode: number;
  toStatusName: string;
  toStatusColor: string;
  label: string;
  requiredFields: string[];
  sortOrder: number;
}

/**
 * Shape of the authenticated user passed by controllers / guards.
 * Mirrored from WorkOrdersService.CurrentUserRef to avoid cross-module import
 * (ProcessModule is imported BY WorkOrdersModule, not the other way around).
 */
export interface CurrentUserRef {
  id: string;
  role: Role;
}
