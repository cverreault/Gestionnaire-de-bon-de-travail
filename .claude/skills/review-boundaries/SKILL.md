---
name: review-boundaries
description: Review hat — modular-monolith boundaries, coupling, cohesion. No cross-module imports, communication via events or shared contracts, clean-architecture layering. A code-review lens for TaskMgr.
disable-model-invocation: true
allowed-tools: Read Grep Glob Bash(git *)
---

# Modular-monolith boundaries review hat

**Applies when:** `backend/src/modules/**`, `backend/src/common/**`

Review the diff ONLY through the architecture/boundaries lens. Binding rules: [CLAUDE.md](../../../CLAUDE.md)
(Architecture + Règles importantes), [ADR-001 modular-monolith-architecture](../../../docs/adrs/ADR-001-modular-monolith-architecture.md)
and [ADR-007 extension-points-and-contracts](../../../docs/adrs/ADR-007-extension-points-and-contracts.md).

## Check for

- **No cross-module imports** — a business module must NEVER import another business module
  directly. All cross-module communication goes through NestJS domain events
  (`@nestjs/event-emitter`, pattern `domain.events.*` / `<module>.<aggregate>.<event>`) or through
  shared interfaces/contracts in `common/`. Flag any `import` reaching into another
  `modules/<other>/…`. **blocker**.
  (Precedent exceptions: `recurring`, `public-api`, `portal` import `WorkOrdersModule` to reuse
  `WorkOrdersService` — an established, documented pattern. New such imports need justification.)
- **Layering** — each module respects the 4 layers: `domain/` (entities, value objects, events)
  depends on nothing; `application/` (services, validators, DTOs) depends on domain; `infrastructure/`
  (Prisma repos, external integrations) implements interfaces; `api/` (controllers) is thin and
  delegates to application. Flag inversions (e.g. a controller with business logic, a domain file
  importing Prisma). **warn**.
- **Shared contracts discipline** — only truly cross-cutting types belong in `common/`
  (contracts, decorators, guards, middleware). Module-specific types stay in the module. Flag
  additions to `common/` that should be module-local. **warn**.
- **Domain events** — carry IDs + essential data only (no full entity graphs); immutable; each
  published event has a fiche in the module spec (`docs/modules/`). Published only when another
  module must react. **warn**.
- **Controller return shape** — controllers return RAW data; the global `TransformInterceptor`
  wraps it in `{ success, data, timestamp }`. A controller returning `{ data: … }` double-wraps and
  breaks the frontend. **blocker**.
- **Coupling & cohesion** — is the logic in the right module? Does the change reach across a
  boundary it shouldn't, or duplicate something that belongs in a shared contract? **warn**.

## Report

Return each finding as `file:line — issue — fix`, severity. If clean, say so.
