import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../contracts/domain-event.interface';

/**
 * Cross-cutting security events.
 *
 * These live in `common/` rather than a domain module because they are
 * emitted by infrastructure (the RolesGuard, future JwtAuthGuard hooks,
 * etc.) — not by a business module.
 *
 * Consumed by the audit module's wildcard listener so refusals end up
 * in the same searchable timeline as the work-order events.
 *
 * Convention is identical to ADR-001 §3 : `security.{aggregate}.{verb}`.
 */

export const SECURITY_EVENT_NAMES = {
  ACCESS_DENIED: 'security.access.denied',
} as const;

export type SecurityEventName = typeof SECURITY_EVENT_NAMES[keyof typeof SECURITY_EVENT_NAMES];

export interface SecurityAccessDeniedData {
  /** HTTP method that was attempted */
  method: string;
  /** Request URL (without secrets — Pino redaction handles auth headers) */
  url: string;
  /** Comma-separated role list the route required */
  requiredRoles: string[];
  /** Role the caller carried (or 'none' for anonymous) */
  actualRole: string;
}

export type SecurityAccessDeniedEvent = IDomainEvent & {
  name: typeof SECURITY_EVENT_NAMES.ACCESS_DENIED;
  data: SecurityAccessDeniedData;
};

/**
 * The aggregateId on a security event is the requested URL — gives the
 * admin a natural pivot on `/audit` (group all denials on the same
 * endpoint) without overloading the existing per-workOrder pivots.
 */
export function securityAccessDenied(
  actorUserId: string | null,
  data: SecurityAccessDeniedData,
): SecurityAccessDeniedEvent {
  return {
    name: SECURITY_EVENT_NAMES.ACCESS_DENIED,
    eventId: randomUUID(),
    aggregateId: `${data.method} ${data.url}`,
    occurredAt: new Date(),
    actorUserId,
    data,
  };
}
