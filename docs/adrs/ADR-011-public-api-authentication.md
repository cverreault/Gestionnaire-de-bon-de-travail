# ADR-011 — Public API authentication

- Status : Accepted
- Date : 2026-07-02
- Deciders : Product / Engineering
- Supersedes : —
- Superseded by : —

## Context

TaskMgr is a UI-first product : the frontend and the backend are tightly
coupled through JWT authentication (access token + refresh, both HttpOnly
via localStorage), and the tenant is derived from the Host header
(`{slug}.taskmgr.com`) with an IP fallback for self-hosted installs.

External integration needs surfaced in B8 :
- Sync work orders from a CRM
- Post BTs from a public web form
- Read tenant data from a BI tool

None of these should require a login/password loop, share a browser
session, or rely on the sub-domain resolution. We need a proper machine-
to-machine authentication path.

## Decision

Introduce a **public API v1** under `/api/v1/*`, authenticated by a
**per-tenant API key** carried in the `X-API-Key` HTTP header.

### Key format

`tkm_<env>_<32-random-b64url>`, e.g. `tkm_live_abc1…xyz9`.

- **Prefix `tkm_`** — the string is scannable at a glance : secret
  scanners (GitHub, Gitleaks) can flag leaked keys in commits.
- **`<env>`** — `live` in production, `dev` elsewhere. Prevents copying
  a dev key into a prod config by accident.
- **32 random bytes → 43 char base64-url** — ≈ 190 bits of entropy,
  comfortably beyond brute-force reach.

### Storage

Only the **SHA-256 hex** of the plaintext lives in `api_keys.key_hash`
(unique-indexed). The plaintext is returned to the caller of
`ApiKeysService.mint()` **exactly once** and shown in a one-time modal
in the UI. Recovery is deliberately impossible — a lost key is revoked
and reissued.

The DB also stores :
- `key_prefix` (first 16 chars) to help the admin identify keys in the
  list without knowing the full plaintext.
- `scope`, `expires_at`, `revoked_at`, `last_used_at`, `created_by_user_id`.

Revocation is **soft** — the row stays for audit and shows a "revoked at"
badge in the admin UI.

### Scope model — coarse bundles

Three levels with linear hierarchy :

| Bundle | Includes | Rationale |
|---|---|---|
| `read-only` | GET only | BI tools, dashboards, sync from TaskMgr → external |
| `read-write` | GET + POST + PATCH + DELETE on core resources | The typical CRM / form / dispatcher integration |
| `admin` | Everything the ADMIN role can do via API | Rare — internal orchestrators, custom mass ops |

`admin ⊇ read-write ⊇ read-only`. The `ApiScopeGuard` compares the endpoint's
`@Scope()` metadata to the key's stored scope and denies with 403 when
insufficient.

Fine-grained per-resource scopes (`workOrders:read`, `clients:write`…) are
a v2 concern — the DB column already holds a plain string, so migrating to
a JSON scope list is a no-op schema change.

### Tenant identification

The API key **is** the tenant claim. `ApiKeyAuthGuard.swapRequestTenant`
overrides whatever the `TenantResolverMiddleware` picked from the Host
header (irrelevant for machine callers) and rewrites both `req.tenant`
and the AsyncLocalStorage context to the key's owner. Sub-domain routing
is not required for external integrators.

### Guards & pipeline

```
Request
  → TenantResolverMiddleware  (host → tenant, placeholder for public API)
  → JwtAuthGuard              (skipped for /api/v1/*)
  → ApiKeyAuthGuard           (X-API-Key → tenant, req.apiKey)
  → RolesGuard                (@Roles unused on public API — no-op)
  → ApiScopeGuard             (@Scope vs key.scope)
  → ThrottlerGuard            (per-user for internal, per-apiKey for public)
  → Handler
```

## Alternatives considered

### OAuth2 / OpenID Connect

Standardised, widely supported by SDKs. Rejected for v1 :

- No end-user-consent flow needed for M2M — API keys are simpler for both
  sides.
- Adds an authorization server and (typically) a JWKS endpoint : more
  moving parts, more secrets to rotate.
- v2 or v3 territory if we later need delegated user access.

### Bearer JWT with long TTL

Reuses the existing infra. Rejected :

- JWTs can't be revoked without a blocklist ; we'd essentially rebuild
  the `api_keys` table anyway.
- The token is opaque to the admin — no "last-used", no scannable prefix,
  no easy revocation UI.

### Webhooks-in-v1 (paired with polling API)

Considered as a v1 add-on. Deferred to v2 :

- Real-time push adds an outbox table, a delivery worker, HMAC signing,
  and retry semantics — an extra 2-3 days of work.
- Most integrators poll for their MVP anyway. Real usage will inform
  the design of the webhook contract.

## Consequences

### Positive

- Machine callers get first-class access without borrowing a JWT.
- Zero coupling to the sub-domain scheme.
- Revocation is one row change, propagates within seconds (5-min cache
  on the frontend, but the DB check is real-time).
- Scope hierarchy keeps DTOs and controllers unchanged — a `Scope('read-write')`
  endpoint accepts an `admin` key by construction.
- Audit trail : every mint / revoke / request is emitted on the event
  bus (`apiIntegration.**`) and picked up by the existing `AuditListener`.

### Negative

- New table (`api_keys`), new module, new guards, +30 endpoints under
  `/api/v1/*`. More surface to review.
- The Prisma tenant-scope middleware is bypassed by raw SQL twice (in
  `ApiKeysService.resolveByPlaintext` and `ApiKeyAuthGuard.swapRequestTenant`)
  because the tenant isn't known yet when the key is validated. Explicit
  and confined, but a pattern to watch.
- The v1 endpoint set is a subset of the internal API : maintenance
  requires keeping the public DTOs in sync with what the internal
  services accept. `PublicUpdateWorkOrderDto` already omits `status` —
  new fields on the internal DTOs are automatically inherited via
  `PartialType(OmitType(...))`.

### Follow-ups

- V2 : webhooks with HMAC signature + outbox pattern.
- V2 : fine-grained scopes (`workOrders:read`, `clients:write`…).
- V2 : per-key rate-limit override in `api_keys` + admin UI.
- V2 : per-key IP allowlist.
- V2 : SDK clients (JS/Python/PHP) auto-generated from the OpenAPI spec.
