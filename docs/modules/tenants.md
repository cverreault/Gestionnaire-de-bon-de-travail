# Module: tenants

| Field | Value |
|---|---|
| **Type** | Core (cross-cutting platform) |
| **Status** | Implemented (B6.1 → B6.13) |
| **Phase** | 4 (B6) |
| **ADR References** | [ADR-001](../adrs/ADR-001-modular-monolith-architecture.md), [ADR-009](../adrs/ADR-009-multi-tenancy.md) |
| **Owner** | Carl Verreault |

## Purpose

Owns the `Tenant` entity and the cross-cutting plumbing that makes TaskMgr serve multiple customers from a single Postgres + single Docker stack : sub-domain resolver, async-local context, request-scoped Prisma auto-filter, RLS backstop, per-tenant quotas, self-service signup, SA admin tools.

## Personas servis

| Persona | Usage |
|---|---|
| **Public (anon)** | POST /signup creates a new workspace |
| **ADMIN** | PATCH /tenant/configs to override SMTP / VAPID locally |
| **SUPER_ADMIN** | GET/PATCH /super-admin/tenants ; POST /super-admin/impersonate |

## Capabilities

- **Sub-domain resolution** — `Host: <slug>.taskmgr.com` → tenantId via TenantResolverMiddleware, cached in-process
- **Request-scoped context** — AsyncLocalStorage exposes `{ tenantId, userId }` to deep services without method-signature pollution
- **Auto-filter Prisma queries** — every read/write touching a tenant-scoped model inherits the active tenantId (B6.4)
- **RLS backstop** — Postgres policies on 23 tables ; `withTenantScope(tenantId, cb)` helper for raw $queryRaw paths
- **Per-tenant quotas** — `max_users / max_work_orders_per_month / max_storage_mb / max_clients` atomic check-and-consume
- **Monthly counter reset** — @Cron('5 0 1 * *') flips `current_work_orders_this_month` back to 0
- **Self-service signup** — POST /signup creates Tenant + first ADMIN + default catalog (process / task types / client types / address types) in a single transaction
- **SA tenant CRUD** — list / get / patch (rename / change plan / activate / quota override). Delete intentionally not exposed
- **SA impersonate** — 15-min access-only token issued for any non-SA user

## API publique

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/signup` | Public | Crée Tenant + ADMIN + catalog. Throttled 3/min. |
| `GET`  | `/api/super-admin/tenants` | SUPER_ADMIN | Liste paginée |
| `GET`  | `/api/super-admin/tenants/:id` | SUPER_ADMIN | Détails |
| `PATCH`| `/api/super-admin/tenants/:id` | SUPER_ADMIN | Rename / plan / quota / activate |
| `POST` | `/api/super-admin/impersonate` | SUPER_ADMIN | Access token cible — accepte `{userId}` OU `{tenantId}` (B7 : auto-pick 1er ADMIN) |
| `GET`  | `/api/super-admin/stats` | SUPER_ADMIN | Snapshot cross-tenant (B7) : counts tenants / users / BTs / storage |
| `GET`  | `/api/super-admin/audit?from&to&tenantSlug&actor&eventName&page&limit` | SUPER_ADMIN | Recherche dans les audit_logs cross-tenant (B7) |
| `GET`  | `/api/super-admin/users?email=<prefix>` | SUPER_ADMIN | Recherche user par email cross-tenant — max 50 (B7) |
| `GET`  | `/api/tenant/configs` | ADMIN | List capabilities |
| `PUT`  | `/api/tenant/configs/:key` | ADMIN | Upsert override TENANT |
| `DELETE` | `/api/tenant/configs/:key` | ADMIN | Drop l'override TENANT |

## Domain events publiés

Aucun en v1.

Future :
- `tenants.tenant.signedUp` — pour brancher l'envoi de l'email de bienvenue + le lien de vérification sans coupler tenants → notifications.
- `tenants.tenant.suspended` — pour les listeners qui doivent réagir (notif au tech, fin de cron, etc.).

## Domain events consommés

Aucun.

## Données possédées

### `tenants` (Prisma : `Tenant`)
- `id` UUID PK
- `slug` String @unique (URL-safe identifier)
- `name` String
- `is_active` Boolean (suspend without delete)
- `plan` TenantPlan enum (FREE / PRO / ENTERPRISE)
- `max_*` quota ceilings (4 columns)
- `current_*` running counters (4 columns)
- `work_orders_reset_at` last monthly reset timestamp
- `owner_email` contact for billing / outreach (today : just informational)
- `created_at` / `updated_at`

### Tenant-scoped tables (23)
Every business table grows a `tenant_id` String + FK to `tenants`. The composite index `(tenant_id, …)` covers the common "scope to my tenant" queries. See `prisma/schema.prisma` for the full list.

## Convention `tenant_id` default

For every business table, the Prisma schema declares :

```prisma
tenantId String @default("00000000-0000-0000-0000-000000000001") @map("tenant_id")
```

The default exists so :
1. The self-hosted single-tenant deployment keeps working without an explicit assignment (every row lands in DEFAULT).
2. Background hooks (process seed, audit cleanup, SA bootstrap) that run before any request context can write rows that target DEFAULT.

The Prisma auto-filter middleware (B6.4) overrides this with the active request's tenantId when one is set. The default is a defensive fallback, not the primary path.

## Variables d'environnement requises

```bash
# Optional — defines the public origin used in verification email links.
# Falls back to http://localhost:8088 in dev.
PLATFORM_ORIGIN=https://app.taskmgr.com
```

`SUPER_ADMIN_EMAIL` and `CONFIG_MASTER_KEY` are inherited from the SA module ; the bootstrap still works without changes.

## Dépendances

| Module | Type | Pourquoi |
|---|---|---|
| `common/prisma` | hard | All reads / writes |
| `common/context/request-context.service` | hard | AsyncLocalStorage propagation |
| `common/contracts/tenant-context.contract` | hard | Sub-domain extraction + DEFAULT constants |
| `common/contracts/quota.contract` | hard | DI token + interface for cross-module consumers |
| `system-configs` | event | Future signup wire-up via `tenants.tenant.signedUp` |

The 23 tenant-scoped models are not module-owned ; they live in the business modules but the cross-cutting filter applies to all of them.

## Tests

- **Unit** :
  * `quota.service.spec.ts` (6 cases)
  * `tenant-scope.middleware.spec.ts` (13 cases on the auto-filter)
  * `tenant-resolver.middleware.spec.ts` (7 cases on slug → tenant)
  * `tenant-context.contract.spec.ts` (8 cases on extractTenantSlug)
  * `request-context.service.spec.ts` (6 cases on AsyncLocalStorage)
- **Roles matrix** : 7 rows added across SuperAdminTenantsController + TenantConfigsController + ImpersonateController
- **Integration** : `tenants-isolation.integration-spec.ts` — 4 cases proving end-to-end isolation via real Postgres

## Open questions

See [ADR-009](../adrs/ADR-009-multi-tenancy.md#open-questions) for the full backlog. Highlights :
- FORCE ROW LEVEL SECURITY + a separate non-owner app role
- Tenant deletion behind a SA-only typed-slug confirmation
- Email verification trigger from signup (event-based wire-up)
- Marketing landing + auth.taskmgr.com login UX
- Billing (Stripe / GoCardless) — separate ADR

## Refs
- B6.1 → B6.13 commits — see ADR-009 references
- [`docs/adrs/ADR-009-multi-tenancy.md`](../adrs/ADR-009-multi-tenancy.md)
- [`docs/sprints/2026-06-sprint-1-summary.md`](../sprints/2026-06-sprint-1-summary.md) — B6 section
