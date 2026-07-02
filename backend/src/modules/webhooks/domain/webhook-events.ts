/**
 * B9 — Whitelist of publishable domain events.
 *
 * We do NOT expose every internal event to webhook receivers — some are
 * security-sensitive (`security.rateLimit.exceeded`), some are bookkeeping
 * (`audit.*`), some carry internal-only state. This is the CURATED list
 * that a webhook can subscribe to, in the exact string form the emitter
 * uses.
 *
 * Adding a new event here is a public-API contract change — bump the
 * getting-started guide and mention it in release notes.
 */
export const WEBHOOK_PUBLISHABLE_EVENTS = [
  // Work orders — the core lifecycle
  'workOrders.workOrder.created',
  'workOrders.workOrder.assigned',
  'workOrders.workOrder.dispatched',
  'workOrders.workOrder.statusChanged',
  'workOrders.workOrder.completed',
  'workOrders.workOrder.slaBreached',

  // Clients & addresses
  'clients.client.created',
  'clients.client.updated',
  'clients.client.deleted',

  // API integrations (self-referential, useful for audit-mirror scenarios)
  'apiIntegration.key.created',
  'apiIntegration.key.revoked',
] as const;

export type WebhookPublishableEvent = (typeof WEBHOOK_PUBLISHABLE_EVENTS)[number];

/**
 * True when `eventName` is on the publishable whitelist.
 */
export function isPublishableEvent(eventName: string): eventName is WebhookPublishableEvent {
  return (WEBHOOK_PUBLISHABLE_EVENTS as readonly string[]).includes(eventName);
}

/**
 * Match `eventName` against a subscriber pattern list.
 *
 * Patterns support:
 *   - exact strings                   `workOrders.workOrder.created`
 *   - trailing wildcards (top-level)  `workOrders.*`
 *   - full wildcard                   `*`
 *
 * Anything else (embedded `*`, prefix wildcards) is treated as a literal —
 * we're not implementing a general glob, just the two patterns integrators
 * actually need.
 */
export function eventMatchesAny(eventName: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern === '*') return true;
    if (pattern === eventName) return true;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      if (eventName === prefix) return true;
      if (eventName.startsWith(prefix + '.')) return true;
    }
  }
  return false;
}

/**
 * Validate the `subscribedEvents` array the user supplies on create/update.
 *
 * Rejects unknown exact names (typos), but allows any wildcard prefix that
 * matches at least one publishable event — this lets integrators subscribe
 * to a whole module without listing every event.
 */
export function validateSubscribedEvents(patterns: string[]): {
  ok: boolean;
  invalid: string[];
} {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return { ok: false, invalid: ['<empty>'] };
  }
  const invalid: string[] = [];
  for (const p of patterns) {
    if (typeof p !== 'string' || p.trim() === '') {
      invalid.push(String(p));
      continue;
    }
    if (p === '*') continue;
    if (p.endsWith('.*')) {
      // Wildcard: at least one publishable event must match the prefix.
      const prefix = p.slice(0, -2);
      const hit = WEBHOOK_PUBLISHABLE_EVENTS.some(
        (evt) => evt === prefix || evt.startsWith(prefix + '.'),
      );
      if (!hit) invalid.push(p);
      continue;
    }
    if (!isPublishableEvent(p)) {
      invalid.push(p);
    }
  }
  return { ok: invalid.length === 0, invalid };
}
