/**
 * B10 — Alert rule matching engine.
 *
 * Pure function library (no DI, no side effects) that decides whether an
 * incoming domain event triggers a stored alert rule. Kept in `domain/` so
 * it's trivially unit-testable without wiring Nest or Prisma.
 *
 * Matching order (all must pass — short-circuits early to keep the
 * per-event cost predictable even with hundreds of rules):
 *   1. eventName equality (exact match — no wildcards on the rule side).
 *   2. process scoping — processDefinitionId / fromStatusId / toStatusId
 *      (each null = "any"). Only applied when the event carries the
 *      corresponding piece of context.
 *   3. taskTypeIds filter — empty array = no filter; non-empty = the event's
 *      taskTypeId must be in the array.
 *   4. priorityIn filter — same semantics.
 *
 * We deliberately DON'T carry the event's raw payload — the caller
 * (AlertsListener) is responsible for extracting a `MatchContext` before
 * calling `match()`. That keeps the engine independent of the event shape.
 */

export interface AlertRule {
  id: string;
  isActive: boolean;
  eventName: string;
  processDefinitionId: string | null;
  fromStatusId: string | null;
  toStatusId: string | null;
  taskTypeIds: string[];
  templateIds: string[];
  clientTypeCodes: string[];
  addressTypeCodes: string[];
  priorityIn: string[];
}

export interface MatchContext {
  eventName: string;
  /** Set on WO events — the aggregate id. */
  workOrderId?: string;
  processDefinitionId?: string | null;
  fromStatusId?: string | null;
  toStatusId?: string | null;
  taskTypeId?: string | null;
  templateId?: string | null;
  clientTypeCode?: string | null;
  addressTypeCode?: string | null;
  priority?: string | null;
}

export function match(ctx: MatchContext, rules: readonly AlertRule[]): AlertRule[] {
  const out: AlertRule[] = [];
  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (rule.eventName !== ctx.eventName) continue;

    if (rule.processDefinitionId && ctx.processDefinitionId !== rule.processDefinitionId) {
      continue;
    }
    if (rule.fromStatusId && ctx.fromStatusId !== rule.fromStatusId) {
      continue;
    }
    if (rule.toStatusId && ctx.toStatusId !== rule.toStatusId) {
      continue;
    }

    if (rule.taskTypeIds.length > 0) {
      if (!ctx.taskTypeId || !rule.taskTypeIds.includes(ctx.taskTypeId)) {
        continue;
      }
    }

    if (rule.templateIds.length > 0) {
      if (!ctx.templateId || !rule.templateIds.includes(ctx.templateId)) {
        continue;
      }
    }

    if (rule.clientTypeCodes.length > 0) {
      if (
        !ctx.clientTypeCode ||
        !rule.clientTypeCodes.includes(ctx.clientTypeCode)
      ) {
        continue;
      }
    }

    if (rule.addressTypeCodes.length > 0) {
      if (
        !ctx.addressTypeCode ||
        !rule.addressTypeCodes.includes(ctx.addressTypeCode)
      ) {
        continue;
      }
    }

    if (rule.priorityIn.length > 0) {
      if (!ctx.priority || !rule.priorityIn.includes(ctx.priority)) {
        continue;
      }
    }

    out.push(rule);
  }
  return out;
}

/**
 * Curated whitelist — the DTOs reject anything else. Mirrors WO_EVENT_NAMES
 * plus can grow to accept clients.* events without a DB change.
 */
export const ALERT_PUBLISHABLE_EVENTS = [
  'workOrders.workOrder.created',
  'workOrders.workOrder.assigned',
  'workOrders.workOrder.dispatched',
  'workOrders.workOrder.statusChanged',
  'workOrders.workOrder.completed',
  'workOrders.workOrder.slaBreached',
  'workOrders.workOrder.requested',
  'clients.client.created',
  'clients.client.updated',
  'clients.client.deleted',
] as const;

export type AlertPublishableEvent = (typeof ALERT_PUBLISHABLE_EVENTS)[number];

export function isPublishableEvent(name: string): name is AlertPublishableEvent {
  return (ALERT_PUBLISHABLE_EVENTS as readonly string[]).includes(name);
}

export const ALERT_CHANNELS = ['inApp', 'email', 'sms', 'push'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export function isValidChannel(c: string): c is AlertChannel {
  return (ALERT_CHANNELS as readonly string[]).includes(c);
}
