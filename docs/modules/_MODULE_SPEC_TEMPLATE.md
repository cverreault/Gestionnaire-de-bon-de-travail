# Module: {Nom du module}

| Field | Value |
|---|---|
| **Type** | Core / Optional |
| **Status** | Draft / Implemented / Deprecated |
| **Phase** | 1 / 2 / 3 |
| **ADR References** | [ADR-XXX](../adrs/ADR-XXX-...md) |
| **Owner** | Carl Verreault |

## Purpose

Une phrase qui résume le but du module. Pourquoi il existe, quel problème il résout.

## Personas servis

| Persona | Usage |
|---|---|
| Admin | Comment il utilise ce module |
| Dispatcher | … |
| Technicien | … |

## Capabilities

Liste à puce de ce que le module **peut faire** (vu de l'extérieur).

- Capability 1 (ex: « Créer un BT avec un type, un client, une adresse »)
- Capability 2
- …

## API publique

Endpoints REST exposés :

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/work-orders` | DISPATCHER, ADMIN | Liste paginée |
| `POST` | `/api/work-orders` | DISPATCHER, ADMIN | Création |
| `GET` | `/api/work-orders/:id` | tous | Détail (filtré pour TECH) |
| `PATCH` | `/api/work-orders/:id/transition` | dépend de la transition | Change le statut |

## Domain events publiés

Tout event que ce module **publie** (consommé par d'autres modules ou par lui-même) :

| Event | Quand | Payload |
|---|---|---|
| `workOrders.workOrder.created` | Création | `{ workOrderId, ... }` |

## Domain events consommés

Tout event que ce module **écoute** :

| Event source | Action |
|---|---|
| `notifications.notification.sent` | Marque le BT comme « techNotified » |

## Données possédées

Tables Prisma sous la responsabilité de ce module :

- `work_orders`
- `work_order_notes`
- `work_order_attachments`

> **Règle** : aucune jointure cross-schema dans le code applicatif. Les FKs cross-module sont autorisées en DB (`work_orders.client_id → clients.id`), mais l'application doit passer par l'API du module proprio (`ClientsService.findOne(id)`) plutôt qu'un join Prisma direct (sauf cas justifié de performance).

## Dépendances

| Module | Type | Pourquoi |
|---|---|---|
| `users` | hard | Le BT a un `createdById` et `assignedToId` |
| `process` | hard | Le BT a un `processDefinitionId` |
| `clients` | hard | Le BT a un `clientId` |
| `notifications` | soft (via events) | Push notification au tech |

## Tests

- **Unit** : `application/services/*.spec.ts` — un par service
- **Integration** : `api/*.controller.spec.ts` — un par controller
- **E2E** : `frontend/src/tests/work-orders-*.test.ts`

## Open questions

Liste de questions en suspens (réponses à reporter dans une ADR si besoin).

## Refs
- ADRs liées
- Issues GitHub
- Docs externes
