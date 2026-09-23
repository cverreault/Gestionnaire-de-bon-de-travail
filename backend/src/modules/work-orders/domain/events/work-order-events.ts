import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../common/contracts/domain-event.interface';

/**
 * Events publiés par le module `work-orders`.
 *
 * Consommateurs futurs : `audit` (B2), `notifications` (B1), `reports` (B3),
 * `inventaire` (D7), `dispatch-ia` (D6).
 *
 * Convention de nom : `workOrders.workOrder.{verb}` (cf. ADR-001 §3a, ADR-003 §6).
 */

export const WO_EVENT_NAMES = {
  CREATED:         'workOrders.workOrder.created',
  ASSIGNED:        'workOrders.workOrder.assigned',
  DISPATCHED:      'workOrders.workOrder.dispatched',
  STATUS_CHANGED:  'workOrders.workOrder.statusChanged',
  COMPLETED:       'workOrders.workOrder.completed',
  /// Emitted by SlaCheckService when an active BT crosses its slaTargetAt
  /// without being completed. Consumed by notifications (B4.c) and audit.
  SLA_BREACHED:    'workOrders.workOrder.slaBreached',
  /// B21 — a client-portal user submitted a work request (WO created at
  /// the pre-approval « Demandé » step). Consumed by notifications
  /// (in-app fan-out to ADMIN/DISPATCHER) and the alerts engine.
  REQUESTED:       'workOrders.workOrder.requested',
  /// B45 — every action lands in the history : note, signatures, field edits.
  /// B57 — the technician opened / left the work order screen (mobile or web) ; audit only.
  OPENED:          'workOrders.workOrder.opened',
  CLOSED:          'workOrders.workOrder.closed',
  NOTE_ADDED:      'workOrders.workOrder.noteAdded',
  SIGNED:          'workOrders.workOrder.signed',
  UPDATED:         'workOrders.workOrder.updated',
} as const;

export type WoEventName = typeof WO_EVENT_NAMES[keyof typeof WO_EVENT_NAMES];

// ── Shared factory ─────────────────────────────────────────────────────────

interface EventInput<TName extends WoEventName, TData> {
  name: TName;
  workOrderId: string;
  actorUserId: string | null;
  data: TData;
}

function makeEvent<TName extends WoEventName, TData>(
  input: EventInput<TName, TData>,
): IDomainEvent & { name: TName; data: TData } {
  return {
    name: input.name,
    eventId: randomUUID(),
    aggregateId: input.workOrderId,
    occurredAt: new Date(),
    actorUserId: input.actorUserId,
    data: input.data,
  };
}

// ── Created ────────────────────────────────────────────────────────────────

export interface WorkOrderCreatedData {
  referenceNumber: string;
  taskTypeId: string | null;
  clientId: string | null;
  assignedToId: string | null;
  processDefinitionId: string | null;
  initialStatusId: string | null;
}

export type WorkOrderCreatedEvent = IDomainEvent & {
  name: typeof WO_EVENT_NAMES.CREATED;
  data: WorkOrderCreatedData;
};

export function workOrderCreated(
  workOrderId: string,
  actorUserId: string | null,
  data: WorkOrderCreatedData,
): WorkOrderCreatedEvent {
  return makeEvent({ name: WO_EVENT_NAMES.CREATED, workOrderId, actorUserId, data });
}

// ── Requested (B21) ────────────────────────────────────────────────────────

export interface WorkOrderRequestedData {
  referenceNumber: string;
  title: string;
  taskTypeId: string | null;
  clientId: string | null;
}

export type WorkOrderRequestedEvent = IDomainEvent & {
  name: typeof WO_EVENT_NAMES.REQUESTED;
  data: WorkOrderRequestedData;
};

export function workOrderRequested(
  workOrderId: string,
  actorUserId: string | null,
  data: WorkOrderRequestedData,
): WorkOrderRequestedEvent {
  return makeEvent({ name: WO_EVENT_NAMES.REQUESTED, workOrderId, actorUserId, data });
}

// ── Assigned ───────────────────────────────────────────────────────────────

export interface WorkOrderAssignedData {
  technicianId: string;
  previousTechnicianId: string | null;
}

export type WorkOrderAssignedEvent = IDomainEvent & {
  name: typeof WO_EVENT_NAMES.ASSIGNED;
  data: WorkOrderAssignedData;
};

export function workOrderAssigned(
  workOrderId: string,
  actorUserId: string | null,
  data: WorkOrderAssignedData,
): WorkOrderAssignedEvent {
  return makeEvent({ name: WO_EVENT_NAMES.ASSIGNED, workOrderId, actorUserId, data });
}

// ── Dispatched ─────────────────────────────────────────────────────────────

export interface WorkOrderDispatchedData {
  technicianId: string;
  dispatchedStatusId: string;
}

export type WorkOrderDispatchedEvent = IDomainEvent & {
  name: typeof WO_EVENT_NAMES.DISPATCHED;
  data: WorkOrderDispatchedData;
};

export function workOrderDispatched(
  workOrderId: string,
  actorUserId: string | null,
  data: WorkOrderDispatchedData,
): WorkOrderDispatchedEvent {
  return makeEvent({ name: WO_EVENT_NAMES.DISPATCHED, workOrderId, actorUserId, data });
}

// ── Status changed (transition générique) ──────────────────────────────────

export interface WorkOrderStatusChangedData {
  fromStatusId: string | null;
  toStatusId: string;
  fromStatusCode: number | null;
  toStatusCode: number;
}

export type WorkOrderStatusChangedEvent = IDomainEvent & {
  name: typeof WO_EVENT_NAMES.STATUS_CHANGED;
  data: WorkOrderStatusChangedData;
};

export function workOrderStatusChanged(
  workOrderId: string,
  actorUserId: string | null,
  data: WorkOrderStatusChangedData,
): WorkOrderStatusChangedEvent {
  return makeEvent({ name: WO_EVENT_NAMES.STATUS_CHANGED, workOrderId, actorUserId, data });
}

// ── Completed ──────────────────────────────────────────────────────────────

export interface WorkOrderCompletedData {
  outcome: 'positive' | 'negative';
  completedStatusId: string;
}

export type WorkOrderCompletedEvent = IDomainEvent & {
  name: typeof WO_EVENT_NAMES.COMPLETED;
  data: WorkOrderCompletedData;
};

export function workOrderCompleted(
  workOrderId: string,
  actorUserId: string | null,
  data: WorkOrderCompletedData,
): WorkOrderCompletedEvent {
  return makeEvent({ name: WO_EVENT_NAMES.COMPLETED, workOrderId, actorUserId, data });
}

// ── Viewed (B57) ───────────────────────────────────────────────────────────

export interface WorkOrderViewedData {
  /** Client timestamp of the open / close (the request may arrive later). */
  at: string;
  source: 'mobile' | 'web';
}

export function workOrderViewed(
  action: 'opened' | 'closed',
  workOrderId: string,
  actorUserId: string | null,
  data: WorkOrderViewedData,
): IDomainEvent & { data: WorkOrderViewedData } {
  return makeEvent({ name: action === 'opened' ? WO_EVENT_NAMES.OPENED : WO_EVENT_NAMES.CLOSED, workOrderId, actorUserId, data });
}

// ── SLA breached (B4) ──────────────────────────────────────────────────────

export interface WorkOrderSlaBreachedData {
  /** ISO 8601 — the target the BT crossed without being completed. */
  slaTargetAt: string;
  /** ISO 8601 — when the breach was detected (= now-ish). */
  detectedAt: string;
  /** Hours of SLA originally configured on the task type at create time. */
  slaHours: number | null;
  /** Carry-over so consumers can route the notification (tech, dispatcher). */
  assignedToId: string | null;
}

export type WorkOrderSlaBreachedEvent = IDomainEvent & {
  name: typeof WO_EVENT_NAMES.SLA_BREACHED;
  data: WorkOrderSlaBreachedData;
};

export function workOrderSlaBreached(
  workOrderId: string,
  data: WorkOrderSlaBreachedData,
): WorkOrderSlaBreachedEvent {
  // No actor — system event, emitted by the cron.
  return makeEvent({ name: WO_EVENT_NAMES.SLA_BREACHED, workOrderId, actorUserId: null, data });
}

// ── Union utile pour les listeners qui veulent tout traiter ────────────────

export type AnyWorkOrderEvent =
  | WorkOrderCreatedEvent
  | WorkOrderAssignedEvent
  | WorkOrderDispatchedEvent
  | WorkOrderStatusChangedEvent
  | WorkOrderCompletedEvent
  | WorkOrderSlaBreachedEvent;

// ── B45 — child actions ────────────────────────────────────────────────────

export interface WorkOrderNoteAddedData {
  noteId: string;
  /** First characters of the note, for the timeline. */
  excerpt: string;
}

export function workOrderNoteAdded(workOrderId: string, actorUserId: string | null, data: WorkOrderNoteAddedData) {
  return makeEvent({ name: WO_EVENT_NAMES.NOTE_ADDED, workOrderId, actorUserId, data });
}

export interface WorkOrderSignedData {
  client: boolean;
  technician: boolean;
}

export function workOrderSigned(workOrderId: string, actorUserId: string | null, data: WorkOrderSignedData) {
  return makeEvent({ name: WO_EVENT_NAMES.SIGNED, workOrderId, actorUserId, data });
}

export interface WorkOrderUpdatedData {
  /** DTO keys that were sent (not the values). */
  fields: string[];
}

export function workOrderUpdated(workOrderId: string, actorUserId: string | null, data: WorkOrderUpdatedData) {
  return makeEvent({ name: WO_EVENT_NAMES.UPDATED, workOrderId, actorUserId, data });
}
