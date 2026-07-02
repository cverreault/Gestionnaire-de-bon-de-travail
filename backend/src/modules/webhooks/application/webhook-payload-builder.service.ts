import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

/**
 * B9 — Turn a raw domain event into the public JSON:API-lite payload
 * shipped to webhook receivers.
 *
 * Shape (identical across event types) :
 * ```
 * {
 *   "id":          "<UUID — the webhook_deliveries row id, useful for idempotency>",
 *   "type":        "workOrders.workOrder.statusChanged",
 *   "createdAt":   "2026-07-02T14:32:07.412Z",
 *   "tenantId":    "...",
 *   "data":        { ... },
 *   "changes":     { ... }   // only for *.statusChanged / *.updated
 * }
 * ```
 *
 * `data` mirrors the public API v1 response shape — an integrator that has
 * already learned `GET /api/v1/work-orders/:id` gets the same fields inside
 * the webhook body. We pull straight from the domain event's `data` field
 * rather than re-fetching the aggregate; the event captures the state at
 * emission which is exactly the semantics a webhook consumer wants.
 *
 * Payload is BUILT ONCE at fanout time and FROZEN in the delivery row so
 * (a) retries keep the same HMAC signature valid and (b) receivers see the
 * state at emission, not at delivery.
 */
@Injectable()
export class WebhookPayloadBuilderService {
  build(input: BuildPayloadInput): WebhookPayload {
    const payload: WebhookPayload = {
      id: input.deliveryId ?? randomBytes(16).toString('hex'),
      type: input.eventName,
      createdAt: (input.occurredAt ?? new Date()).toISOString(),
      tenantId: input.tenantId,
      data: sanitizeData(input.data),
    };

    // Wire the "what changed" bit for events that carry it. Downstream
    // consumers (e.g. "notify Slack when status flips to COMPLETED_NEGATIVE")
    // usually key off `changes` more than the full snapshot.
    if (input.changes && Object.keys(input.changes).length > 0) {
      payload.changes = input.changes;
    }

    return payload;
  }
}

// ─── Types ────────────────────────────────────────────────────────

export interface BuildPayloadInput {
  eventName: string;
  tenantId: string;
  occurredAt?: Date;
  /** The delivery row id, if the caller has one — used as payload `id`. */
  deliveryId?: string;
  /** Raw event data — will be JSON-serialised as-is after sanitizing. */
  data: unknown;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

export interface WebhookPayload {
  id: string;
  type: string;
  createdAt: string;
  tenantId: string;
  data: unknown;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

/**
 * Best-effort scrub. Drop fields that leak internal state and would surprise
 * an integrator (Prisma-only fields, hashes, refresh tokens). This is
 * belt-and-suspenders — a sanitary domain event should already omit them.
 */
function sanitizeData(data: unknown): unknown {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data;
  const clone: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  const drop = [
    'passwordHash',
    'password_hash',
    'keyHash',
    'key_hash',
    'secretHash',
    'secret_hash',
    'refreshToken',
    'refresh_token',
    'internalNotes',
  ];
  for (const k of drop) delete clone[k];
  return clone;
}
