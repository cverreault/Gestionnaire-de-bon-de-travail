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
