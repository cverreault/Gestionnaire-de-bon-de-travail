# Module: audit

| Field | Value |
|---|---|
| **Type** | Core |
| **Status** | Implemented |
| **Phase** | 2 |
| **ADR References** | [ADR-001](../adrs/ADR-001-modular-monolith-architecture.md), [ADR-007](../adrs/ADR-007-extension-points-and-contracts.md) |
| **Owner** | Carl Verreault |

## Purpose

Trace immuable de tous les domain events émis par la plateforme. Premier consommateur cross-module des events publiés via `EventEmitter2`. Sert deux usages :

1. **Compliance** (Loi 25 / PIPEDA) — savoir qui a fait quoi sur un BT, à quelle heure, depuis quel rôle.
2. **Debug post-mortem** — reconstituer la séquence d'events qui a mené à un état incohérent sans toucher à un SIEM externe.

Pas d'update, pas de delete : table append-only avec UPSERT silencieux sur conflit d'`eventId` (idempotence quand deux listeners reçoivent le même event).

## Personas servis

| Persona | Usage |
|---|---|
| **Admin** | Page `/audit` (filtres event/agrégat/acteur/date + pagination + export CSV). Drill-down depuis la timeline d'un BT vers la liste filtrée |
| **Dispatcher** | Timeline d'un BT sur sa page détail (RBAC route : pas de page globale) |
| **Technicien** | Timeline d'un BT **sur ses propres BT seulement** (RBAC objet enforced côté service) |

## Capabilities

- Persiste tout `IDomainEvent` reçu sur `workOrders.**` (wildcard EventEmitter2)
- Hydrate l'acteur (firstName, lastName, email, role) en batch via `users.findMany`
- Expose la timeline d'un agrégat (50 events récents, newest first)
- Expose la liste paginée globale filtrable (eventName, aggregateId, actorUserId, plage occurredAt)
- Exporte la slice filtrée en CSV UTF-8 + BOM (cap 5000 lignes) pour Excel et compliance
- Garantit l'idempotence : replay du même `eventId` est silencieusement absorbé (P2002 swallowed)

## API publique

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/audit` | ADMIN | Liste paginée filtrable (page, limit, eventName, aggregateId, actorUserId, from, to) |
| `GET` | `/api/audit/export.csv` | ADMIN | Export CSV de la slice filtrée (cap 5000 lignes) |
| `GET` | `/api/audit/aggregate/:id` | ADMIN, DISPATCHER, TECHNICIAN (sur ses BT) | Timeline d'un agrégat — 50 events récents |

RBAC objet sur `/aggregate/:id` : si le caller est TECHNICIAN, le service vérifie `workOrder.assignedToId === currentUser.id` avant de lire la moindre entrée d'audit (sinon 403 ou 404).

## Domain events publiés

Aucun pour l'instant. Le module est exclusivement **consommateur**. (Évolution future possible : `audit.entry.recorded` pour brancher un module de notification real-time sur les events sensibles.)

## Domain events consommés

| Event source | Action |
|---|---|
| `workOrders.**` (wildcard) | `record()` — persiste l'event en base |

Le listener vit dans `application/audit.listener.ts` avec `@OnEvent('workOrders.**', { async: true, promisify: true })`. **Important** : tout throw du listener est avalé — l'audit ne doit jamais bloquer le flux métier d'origine.

## Données possédées

- `audit_logs` (Prisma : `AuditLog`)
  - `id` (= `IDomainEvent.eventId`, UUID, PK)
  - `eventName` (ex: `workOrders.workOrder.assigned`)
  - `aggregateId` (ex: workOrderId)
  - `occurredAt` (`= IDomainEvent.occurredAt`)
  - `actorUserId` (nullable — events système comme `boot`, `seed`)
  - `data` (JSONB, payload variable selon eventName)
  - `createdAt` (timestamp serveur, peut différer de `occurredAt` si traitement async)

Indexes :
- `(aggregate_id, occurred_at DESC)` — pour la timeline d'un BT
- `(event_name, occurred_at DESC)` — pour filtrer par type d'event
- `(actor_user_id, occurred_at DESC)` — pour audit "qui a fait quoi"

## Dépendances

| Module | Type | Pourquoi |
|---|---|---|
| `users` | soft (lecture directe Prisma) | Hydrater `actor` dans la timeline — pas d'import de `UsersService` (ADR-001 §3) |
| `work-orders` | soft (lecture directe Prisma, RBAC objet) | Vérifier `assignedToId` quand un TECHNICIAN demande une timeline |

Pas de dépendance sur un module métier au sens de l'import direct. Tout le couplage passe par events et lectures Prisma read-only.

## Tests

- **Unit** : `application/services/audit.service.spec.ts` — 16 cases couvrant `record` (idempotence P2002), `findRecentForAggregate` (RBAC objet), `findAllPaginated` (tous les filtres + pagination), `exportCsv` (BOM, JSON payload, cap 5000).
- **Permissions** : couvert par `common/guards/roles-matrix.spec.ts` (la rangée `AuditController`).

## Open questions

- Faut-il un mécanisme de purge ou d'archivage froid pour les events > 12 mois ? (Loi 25 demande de minimiser la conservation des données personnelles.)
- Brancher un canal Slack/email sur certains events sensibles (`workOrders.workOrder.completed` avec `outcome=negative`, ou `security.access.denied` quand C13 sera persisté en DB) ?
- Quand `RolesGuard` (C13) émettra-t-il un domain event en plus du log structuré ? Aujourd'hui c'est juste un warn Pino.

## Refs
- [ADR-001 §3](../adrs/ADR-001-modular-monolith-architecture.md) — règles de communication inter-module
- [ADR-007 §F3](../adrs/ADR-007-extension-points-and-contracts.md) — interface `IDomainEvent` consommée
- `backend/src/modules/work-orders/domain/events/work-order-events.ts` — events publiés par `work-orders`
