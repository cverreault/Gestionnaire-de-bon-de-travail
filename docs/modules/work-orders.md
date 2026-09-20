# Module: work-orders

| Field | Value |
|---|---|
| **Type** | Core |
| **Status** | Implemented |
| **Phase** | 1 (V1) + 2 (V3) + 3 (B4 SLA) |
| **ADR References** | [ADR-001](../adrs/ADR-001-modular-monolith-architecture.md), [ADR-003](../adrs/ADR-003-dispatch-engine.md), [ADR-007](../adrs/ADR-007-extension-points-and-contracts.md) |
| **Owner** | Carl Verreault |

## Purpose

Cœur métier de la plateforme. Aggregate central qui orchestre tout le cycle de vie d'un bon de travail, de la création à la complétion. Source de vérité pour la dispatch logic, le moteur de processus, et désormais le SLA.

Publie les domain events qui alimentent l'audit, les notifications, et tout futur module qui voudrait réagir à la vie d'un BT.

## Personas servis

| Persona | Usage |
|---|---|
| **Admin** | CRUD complet, édition tout champ, configuration des types/processus, lecture audit, override de transitions, export CSV, duplication |
| **Dispatcher** | Création + assignation + dispatch, suivi du parc actif (drag-and-drop sur technicien), édition limitée, recherche globale |
| **Technicien** | Lecture **uniquement de ses propres BT** (filtre `assignedToId` server-side + IDOR check sur findOne), transitions de statut sur ses BT, ajout notes/photos terrain, édition `completionNotes` / `negativeReason` / `templateData` seulement |

## Capabilities

- CRUD complet (POST, PATCH, DELETE soft)
- Recherche / filtrage / pagination (status, type, technicien, plage dates, priorité min, recherche textuelle, **breach SLA** depuis B4)
- Export CSV de la slice filtrée (cap 5000 lignes)
- Duplication d'un BT existant (titre, type, client, template — sans technicien ni dates)
- Génération automatique du numéro de référence (`PLB-20260514-0001`) selon le préfixe du type
- Moteur de processus configurable (states + transitions + permissions par rôle) — délégué à `ProcessEngineService`
- **SLA tracking** (B4) — `slaTargetAt` calculé au create depuis `taskType.slaHours`, immuable
- **Détection de breach SLA** (B4) — `SlaCheckService` cron 15 min met à jour `slaBreachedAt` et émet un domain event
- Notes terrain + pièces jointes (relations dédiées)
- Templates de formulaires custom (sections + champs typés + RBAC granulaire par champ)
- Field-level filtering au sortir du service (admin bypass)

## API publique

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/work-orders` | tous (filtre service) | Liste paginée filtrable |
| `GET` | `/api/work-orders/export.csv` | ADMIN, DISPATCHER | Export CSV |
| `GET` | `/api/work-orders/:id` | tous (IDOR check) | Détail |
| `GET` | `/api/work-orders/:id/available-transitions` | tous | Transitions disponibles selon rôle + état |
| `POST` | `/api/work-orders` | ADMIN, DISPATCHER | Création |
| `POST` | `/api/work-orders/:id/duplicate` | ADMIN, DISPATCHER | Clone (CREATED, sans tech) |
| `POST` | `/api/work-orders/:id/assign-and-dispatch` | ADMIN, DISPATCHER | Raccourci assigner + dispatcher |
| `POST` | `/api/work-orders/:id/transition` | tous (RBAC processus) | Change le statut |
| `PATCH` | `/api/work-orders/:id` | tous (whitelist tech) | Modification |
| `GET` | `/api/work-orders/:id/notes` | tous (IDOR) | Notes terrain |
| `POST` | `/api/work-orders/:id/notes` | tous (IDOR) | Ajouter une note |

RBAC objet :
- TECHNICIAN ne peut lire que les BT où `assignedToId === currentUser.id` (filtre service-side dans `findAll`, IDOR check dans `findOne`)
- TECHNICIAN ne peut transitionner que ses propres BT
- TECHNICIAN ne peut PATCH que la whitelist : `completionNotes`, `negativeReason`, `templateData` (selon RBAC du template)
- Toutes les autres tentatives sont filtrées au niveau service, jamais propagées en SQL

## Sous-traitance — « Mandaté par » (B42)

Un BT peut être exécuté chez un client (ou un emplacement) **pour le compte d'un donneur d'ordre** : `work_orders.principal_client_id` → `clients.id` (FK `SET NULL`, index). Règles :

- `principalClientId` explicite dans `POST/PATCH /work-orders` ; à la création, s'il est absent, le BT hérite du « client de » de son client (`clients.principal_client_id`), ou du client lui-même s'il est de type `PRINCIPAL` (une job sur un site de Lumii, commandée par Lumii, est « mandatée par Lumii »). `null` retire le mandat.
- Le donneur d'ordre **peut** être le client du BT. Seule la fiche client refuse d'être son propre « client de ».
- Filtre `?principalClientId=` sur `GET /work-orders` ; `principalClient` (id, nom, société, type) est inclus dans le détail et la liste.
- Affiché sur le détail admin et technicien, la liste technicien, l'impression PDF, avec le filtre « Mandaté par » sur la liste admin.
- Côté `clients` : champ « Client de (donneur d'ordre) », type de client `PRINCIPAL` (« Donneur d'ordre », ajouté à l'enum et à la configuration de chaque tenant par la migration).

> **ADR-016 §4** — `PATCH /:id` (`@Idempotent()`, champs de formulaire et notes de fin depuis la file mobile) et `POST /:id/signatures` acceptent `expectedUpdatedAt` (409 `OPTIMISTIC_LOCK_CONFLICT` si périmé) et renvoie `updatedAt`, comme la transition.

> **ADR-016 §2 (B37.6)** — toute mutation enfant rafraîchit `work_orders.updated_at` : `createNote` (ici), upload / suppression de pièce jointe (`attachments`), ajout / retrait de pièce (`parts`). Chaque réponse porte `workOrderUpdatedAt`, que l'app mobile renvoie comme prochain `expectedUpdatedAt`. Conséquence acceptée : un technicien peut recevoir 409 `OPTIMISTIC_LOCK_CONFLICT` après une note du répartiteur ; l'app resynchronise puis rejoue.

## Tags (B44)

Libellés colorés définis par l'admin (`settings` : `GET/POST/PATCH/DELETE /settings/tags`, table `tags`, unique `(tenant_id, name)`), posés sur les BT, les clients et les adresses via des tables de liaison sans `tenant_id` (`work_order_tags`, `client_tags`, `address_tags`, `ON DELETE CASCADE` des deux côtés). Règles :

- `tagIds: string[]` dans `POST/PATCH /work-orders` (et dans les DTOs clients / adresses) **remplace l'ensemble** ; `[]` retire tout, absent = inchangé. Chaque id est vérifié dans le tenant courant (`common/prisma/tag-links.ts`, 400 sinon).
- Filtre `?tagIds=a,b` (**au moins un** des tags) sur `GET /work-orders`, `GET /clients`, `GET /clients/addresses/all`.
- Réponse : `tags: [{ id, name, color }]` **à plat** sur le BT, le client et l'adresse. Le middleware Prisma `tag-flatten.middleware.ts` aplatit `[{ tag }]` sur tout résultat des modèles `WorkOrder`, `Client`, `ClientAddress` (relations imbriquées comprises), donc aucun site de retour n'a à s'en soucier ; la projection sync mobile les expose aussi (`SyncWorkOrder.tags`).
- Supprimer un tag le retire partout (cascade) ; le désactiver (`isActive=false`) le cache seulement des sélecteurs.
- Le web propose d'office les tags du client et de l'adresse à la création du BT (copie côté client, aucune règle serveur).
- Hors périmètre pour l'instant : groupes de techniciens et permissions de répartiteur par tag (visibilité), à traiter dans une ADR dédiée.

## Domain events publiés

| Event | Quand | Payload |
|---|---|---|
| `workOrders.workOrder.created` | Tout BT créé | `{ referenceNumber, taskTypeId, clientId, assignedToId, processDefinitionId, initialStatusId }` |
| `workOrders.workOrder.assigned` | Un BT change d'assigné | `{ technicianId, previousTechnicianId }` |
| `workOrders.workOrder.dispatched` | Transition vers `DISPATCHED` | `{}` |
| `workOrders.workOrder.statusChanged` | Toute transition de statut | `{ fromStatusId, toStatusId, fromStatusCode, toStatusCode }` |
| `workOrders.workOrder.completed` | Transition vers `COMPLETED_*` | `{ outcome: 'positive' \| 'negative', completedStatusId }` |
| `workOrders.workOrder.slaBreached` (B4) | `SlaCheckService` détecte un breach | `{ slaTargetAt, detectedAt, slaHours, assignedToId }` — `actorUserId: null` (système) |

Tous ces events sont consommés automatiquement par le module `audit` (wildcard `workOrders.**`) et par `notifications` (handlers explicites pour `assigned` + `slaBreached`).

## Domain events consommés

Aucun. Le module est exclusivement **publisher**.

## Données possédées

### `work_orders` (Prisma : `WorkOrder`)
Champs principaux : `id`, `referenceNumber`, `status`, `type` (enum legacy), `title`, `description`, `priority`, scheduling (`scheduledDate/StartTime/EndTime`, `actualStartTime/EndTime`), completion (`completionNotes`, `negativeReason`), `templateData` (JSONB), `dispatchedAt`, **`slaTargetAt`** (B4), **`slaBreachedAt`** (B4).

Relations : `assignedToId` → User, `createdById` → User, `clientId` → Client, `clientAddressId` → ClientAddress, `taskTypeId` → TaskType, `processDefinitionId` + `currentStepId` → process engine.

Indexes notables :
- `(status)`, `(assignedToId)`, `(scheduledDate)`, `(referenceNumber)`
- `(clientId)`, `(taskTypeId)`, `(processDefinitionId)`
- `(slaTargetAt, slaBreachedAt)` (B4) — scan cron pour les breach

### Relations dédiées
- `notes` (`Note[]`) — texte libre, auteur, timestamp
- `attachments` (`Attachment[]`) — métadonnées (le binaire est dans MinIO via `attachments` module)
- `appointments` (`Appointment[]`) — événements calendrier
- `tags` (`WorkOrderTag[]` → `Tag`) — B44, exposé à plat

## Dépendances

| Module | Type | Pourquoi |
|---|---|---|
| `process` | hard | `ProcessEngineService` orchestre les transitions, `ProcessCacheService` résout le processus pour un type |
| `templates` | soft (exception ADR-001 §3) | `applyTemplateRbac()` helper réutilisé pour filtrer les champs custom selon les viewRoles |
| `clients`, `users`, `task-types` | partage de modèle | Relations Prisma seulement, pas d'import de service |

Aucune dépendance sur les modules **consommateurs** (audit, notifications, search). C'est eux qui réagissent aux events, pas l'inverse.

## Jobs nocturnes / cron

| Service | Cron | Action |
|---|---|---|
| `SlaCheckService` (B4) | `*/15 * * * *` (toutes les 15 min) | Scan des BT avec `slaTargetAt < now AND slaBreachedAt IS NULL AND status NOT IN COMPLETED_*`. Set `slaBreachedAt`, émet `workOrders.workOrder.slaBreached`. Cap 100 / run. |

## Tests

- **Unit** : `work-orders-transition.spec.ts` (20+ tests sur les transitions, RBAC, EN_ROUTE → IN_PROGRESS auto, COMPLETED_NEGATIVE requires negativeReason, etc.), `sla-check.service.spec.ts` (7 tests SLA breach detection)
- **Permissions** : 11 lignes dans `roles-matrix.spec.ts` (couvre tous les endpoints du controller)
- **Process engine** : tests propres au module `process` (process-engine + process-cache + process-seed)

## Open questions

- Re-classification d'un BT vers un type avec un `slaHours` différent : actuellement le `slaTargetAt` reste figé. Faut-il un endpoint pour le recalculer manuellement ?
- Pause du SLA si le BT est en attente client (statut hypothétique `WAITING_CLIENT`) ? Demanderait un statut hors-clock et un cumul des temps actifs.
- Le batch SLA cron est cap à 100 / run. Si on dépasse durablement, il faut soit augmenter, soit batch en boucle. À surveiller en prod.
- Le filtre `slaBreached` est binaire. Faut-il un filtre "imminent" (breach dans les 60 min) pour le dashboard dispatcher ?
- Suppression d'un type avec des BT actifs : aujourd'hui Prisma laisse les BT orphelins (relation optionnelle). Cleanup ou warning admin ?

## Refs
- [ADR-003](../adrs/ADR-003-dispatch-engine.md) — moteur de dispatch et logique de transitions
- [`docs/modules/dispatch-logic.md`](dispatch-logic.md) — détail des transitions par statut
- B4.a commit `bc00848` — schema SLA
- B4.b — SlaCheckService cron
- B4.c commit `9fbd15c` — listener fan-out
- B4.d commit `1a40258` — UI badge + filtre
