# ADR-012 — Outbound webhooks (event subscriptions)

- **Status**: Accepted
- **Date**: 2026-07-02
- **Deciders**: cverreault
- **Supersedes**: —

## Context

B8 shipped the pull-based public API. Integrators asked for a push mechanism
so they don't have to poll `/api/v1/work-orders` waiting for a state change.
Standard solution: outbound webhooks — TaskMgr POSTs an event payload to a
URL the tenant registers, signed so the receiver can trust it.

TaskMgr today has :

- an `EventEmitter2` bus with an `AuditListener` subscribed to `**`
- six `@Cron`-based sweepers (via `@nestjs/schedule`)
- tenant-scoped Prisma middleware; `$queryRawUnsafe` used for cross-tenant
  reads
- **no** Redis — a queue would be a new infra dep

Scale target: a small tenant sees ≤ 50 BT/day and a few hundred events/day.

## Decisions

### 1. Storage-backed outbox + `@Cron` sweeper (no Redis / BullMQ)

`webhook_deliveries` is an append-only outbox. A `@Cron('*/30s')` sweeper
claims batches with `SELECT ... FOR UPDATE SKIP LOCKED`, POSTs them, updates
the row. Retries UPDATE the same row (no new insert), so `id` is a stable
idempotency key for receivers.

**Rejected**: introducing Redis + BullMQ. It brings dashboards and priority
queues but also a new service, a second failure mode (queue-loss vs
DB-loss), and configuration surface. `FOR UPDATE SKIP LOCKED` handles the
multi-instance case at our scale. Migration path if we outgrow it: swap the
sweeper for a BullMQ processor reading the same `payload` column — no
schema change.

### 2. Stripe-style HMAC signing

Header : `X-TaskMgr-Signature: t=<unix-seconds>,v1=<hex>` where
`v1 = HMAC_SHA256(secret, "<t>.<rawBody>")`. Also sent :
`X-TaskMgr-Timestamp`, `X-TaskMgr-Event`, `X-TaskMgr-Delivery`.

**Rationale** :
- Signing the timestamp *inside* the MAC input prevents a captured payload
  being replayed with a fresh timestamp.
- Bare `X-Webhook-Secret: <shared>` leaks the secret to every intermediate
  proxy that logs headers and gives no replay protection.
- Format familiar to any integrator who has worked with Stripe / GitHub /
  Shopify — lower onboarding friction.

### 3. Signing secret stored ENCRYPTED, not hashed

The dispatcher needs the plaintext at delivery time to sign — a hash is
useless there. So `webhook_endpoints.secret_encrypted` holds AES-256-GCM
ciphertext (IV | authTag | ciphertext, base64). Key comes from
`WEBHOOK_MASTER_KEY` env (64-char hex, i.e. 32 raw bytes), with a
`SHA-256(JWT_SECRET)` fallback for zero-config dev bring-up.

The UI still shows the plaintext exactly once at creation / regenerate.
There is no decrypt endpoint : an admin who lost the secret must regenerate.

**Trade-off accepted** : an attacker with DB read access + the master key
could forge webhook signatures. Mitigation is standard : environment
segregation and secret storage discipline (the master key must not sit in
the same secret store as the DB credentials).

**Rejected** :
- Storing plaintext — even worse (no key rotation ever possible).
- Per-tenant KMS — needs an external KMS dependency; overkill for our scale.

### 4. Retry schedule : 30s → 2min → 10min → 1h → 6h → abandon

Six attempts over ~7 hours. Survives an overnight incident on the receiver
side without indefinitely accumulating pending rows.

After 15 consecutive failed deliveries on an endpoint (across events),
`is_active` flips to `false` with a `disabled_reason`. Re-enabling from
the admin UI clears the counter — the admin has implicitly confirmed the
receiver is fixed.

### 5. Event routing : `TEXT[]` + trailing wildcard

`webhook_endpoints.subscribed_events TEXT[]` accepts either exact names
or `<module>.*` / `*`. Matching runs in-process in the fanout listener.
Cheap at our fan-out size (≤ 50 endpoints per tenant), no join table
needed, one UPDATE for "toggle 3 subscriptions" in the UI.

### 6. Payload shape : JSON:API-lite, `data` mirrors the public API v1

```json
{
  "id": "<delivery id>",
  "type": "workOrders.workOrder.created",
  "createdAt": "2026-07-02T14:32:07.412Z",
  "tenantId": "…",
  "data": { … },
  "changes": { "status": { "from": "…", "to": "…" } }
}
```

`data` uses the same shape as the corresponding `/api/v1/*` GET response.
An integrator who has learned the public API already knows the payload
structure.

Payload is BUILT ONCE at fanout time and FROZEN in the delivery row so
retries carry a valid signature and receivers see the state at emission.

### 7. SSRF guard on webhook URL

On create/update, `WebhooksService.validateUrl` :
- rejects non-`http:` / `https:` protocols
- rejects `http://` in production
- resolves the hostname via `dns.lookup` and rejects any answer in
  `127/8`, `10/8`, `169.254/16` (metadata IP!), `192.168/16`,
  `172.16/12`, `0/8`, `::1`, `fc00::/7`, `fe80::/10`

The public-API `POST /v1/webhooks` uses the same service so this can't be
bypassed by minting an API key and calling the JSON endpoint.

## Not in v1

- Payload filtering (`only when priority=HIGH`)
- Chained webhooks / re-emission
- Per-tenant volume caps or per-endpoint rate limits
- WebSocket-live delivery viewer
- Custom receiver headers, mTLS, OAuth-signed webhooks
- Event batching
- Configurable per-endpoint retry policy
- Master-key rotation with versioning

Any of these can be added without a schema change beyond one nullable column.
