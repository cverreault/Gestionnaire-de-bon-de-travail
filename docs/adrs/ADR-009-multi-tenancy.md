# ADR-009 — Multi-tenancy (B6)

| Status | Accepted |
|---|---|
| Date | 2026-06-29 |
| Deciders | Carl Verreault |
| Supersedes | — |

## Context

TaskMgr was single-tenant : one Docker stack = one customer. To pivot to a SaaS model (sell at 99 $/mo instead of 5000 $/year self-hosted), we needed multiple customers on the same instance without seeing each other's data.

Three architectural options were on the table :

| # | Pattern | Pros | Cons |
|---|---|---|---|
| **A** | Shared DB + `tenant_id` on every business table | Simple ops (1 backup / 1 monitoring), cheapest hosting, native Prisma | All isolation lives in app code → 1 bug = leak |
| B | Schema per tenant | Logical isolation via search_path | Prisma support is awkward, ~10k schema limit, migrations become loops |
| C | DB per tenant | Physical isolation | Connection-pool explosion, ~50 MB baseline × N, multi-DB migrations |

## Decision

**Pattern A** — shared DB + `tenant_id` column on 23 business tables. The app-layer isolation is the primary defence ; Postgres RLS is layered on top as a backstop.

Sub-domain identifies the tenant (`{slug}.taskmgr.com`), JWT carries the tenantId claim, and the back-end double-checks both match. The DEFAULT tenant (UUID `00000000-…-001`) hosts every pre-multi-tenancy row so the self-hosted single-tenant deployment keeps working untouched.

## Implementation summary

| Layer | Mechanism |
|---|---|
| **DB schema** | Each business table grows `tenant_id` FK to `tenants` ; @@unique constraints become composite `(tenant_id, …)` ; system_configs gets a NULLABLE tenant_id + scope enum (GLOBAL / TENANT) |
| **Sub-domain → tenantId** | `TenantResolverMiddleware` reads the Host header at the head of every /api request, attaches `request.tenant`, caches slug→tenant in-process |
| **Request scope propagation** | `RequestContextService` (Node AsyncLocalStorage) exposes the active `{ tenantId, userId }` to every service without threading through method signatures |
| **JWT** | Payload carries `tenantId` — `JwtAuthGuard` rejects the request when `JWT.tenantId !== request.tenant.id` |
| **Auto-filter Prisma queries** | `tenant-scope.middleware` ($use) injects `where.tenantId` or `data.tenantId` into every query against the 23 scoped models. Tenant / SystemConfig excluded |
| **RLS backstop** | Postgres policies on every business table : `USING (current_setting('app.tenant_id', true) = tenant_id OR setting unset)`. `withTenantScope(tenantId, callback)` helper opens a transaction with the GUC set so raw $queryRaw paths inherit the isolation too |
| **Quotas** | Tenant row carries `max_*` ceilings + `current_*` counters. `QuotaService.checkAndConsume` is an atomic SQL update that returns zero rows on overflow → ForbiddenException |
| **Configs dual-scope** | `SystemConfigService.resolve` reads TENANT > GLOBAL > env > undefined. ADMIN of a tenant can override SMTP / VAPID without touching the operator's GLOBAL defaults |

## Posture on security

- **Two independent layers** : the application middleware is the primary filter ; Postgres RLS catches anything that bypasses Prisma (raw SQL, direct psql, future modules that forget the middleware).
- **JWT spoofing blocked at the head** : the sub-domain decides which tenant the request belongs to, and the JWT must agree. A stolen tenant-A token replayed against tenant-B's sub-domain is rejected with 401/403 before reaching any business logic. The B6.13 integration spec proves this end-to-end.
- **Per-tenant email uniqueness** : `jean@gmail.com` can exist in two different customers. The sub-domain decides which one is logging in.
- **Anti-enumeration on signup + tenant resolve** : unknown slug → 404 ("aucun espace de travail à cette adresse"), same shape as for an inactive tenant.
- **SA impersonation is access-token-only** : no refresh token is issued. Max session = 15 min.

## Posture on operations

- **Self-hosted preserved** : the DEFAULT tenant exists from the Genesis migration onward. Existing deployments don't notice the change.
- **No FORCE ROW LEVEL SECURITY** today : the DB owner (`taskmgr`) bypasses RLS so seeders / crons / migrations keep working without a SET app.tenant_id dance. Tightening this requires creating a separate non-owner app role — out of scope for B6.
- **Quotas are runtime-tunable per tenant** : the SA endpoint can override `max_users` / `max_work_orders_per_month` / `max_storage_mb` / `max_clients` per row without code changes.
- **Catalog bootstrap on signup** : every new tenant gets a default process (4 statuses) + 5 task types + 2 client types + 3 address types — runs in the same transaction as the tenant + first user, so a partial seed never leaves orphaned rows.
- **Monthly counter reset** : `@Cron('5 0 1 * *')` flips `current_work_orders_this_month` back to 0 for every tenant on the 1st.

## Consequences

### Positive
- SaaS model is now possible (sell at low monthly price, mutualised infra).
- New customer onboarding self-service via POST /signup. Zero ops involvement.
- Cross-tenant fixes propagate to every customer with one deploy.
- The SA can debug a customer's session via the impersonate endpoint without asking for their password.

### Negative
- Every PR touching a business table needs to remember the tenant scope.
  Mitigated by the auto-filter middleware (B6.4) — even an obviously-missing
  `where: { tenantId }` is caught at the framework layer.
- One bug in the Prisma middleware = potential cross-tenant leak.
  Mitigated by RLS (B6.5) catching it at the DB layer.
- The "DB owner bypasses RLS" posture means a compromised DB role
  defeats RLS. Tightening requires a separate non-owner role — backlog.
- The `findUnique` interception (B6.4) does a post-fetch tenant check
  instead of pushing the predicate into the WHERE clause. Cost : one
  extra row fetched per cross-tenant attempt (which then null-outs).
  Acceptable.

### Neutral
- email is now per-tenant unique — `findUnique({email})` had to become
  `findFirst({email})` in every service. Touched 2 services (templates,
  process) ; the rest already used the per-row PK lookup.

## Open questions

- **Per-tenant `tenant_id` GUC enforced** : would require a non-owner app
  role + a Prisma middleware that issues `SET LOCAL` on every query.
  ~2-3 days. Backlog.
- **Tenant deletion endpoint** : intentionally NOT exposed (one click =
  end of a customer's existence). Add behind a SA-only typed-slug
  confirmation flow when actually needed.
- **Email verification trigger from signup** : the EmailVerificationService
  exists but the signup flow doesn't issue the first token yet. Wire via
  a domain event (signup → notifications listener) — follow-up.
- **Marketing landing + auth.taskmgr.com login UX** : users currently log
  in directly at `{slug}.taskmgr.com/login`. A neutral sub-domain that
  asks for the slug first is friendlier when somebody forgets their
  workspace name — follow-up.
- **Billing** : intentionally hors-scope. Stripe / GoCardless integration
  is a separate ADR when commercial demand materialises.

## References

- B6.1 commit — schema foundation + Genesis migration
- B6.2 commit — TenantResolver middleware
- B6.3 commit — JWT claim + AsyncLocalStorage + per-tenant email
- B6.4 commit — Prisma auto-filter middleware
- B6.5 commit — RLS policies + `withTenantScope`
- B6.6 commit — Quotas + monthly reset
- B6.7 commit — Self-service signup + tenant bootstrap
- B6.8 commit — Email verification (soft)
- B6.9 commit — SMTP/VAPID dual-scope
- B6.10 commit — SA tenant CRUD
- B6.11 commit — SA impersonate
- B6.12 commit — frontend signup page
- B6.13 commit — cross-tenant integration tests
