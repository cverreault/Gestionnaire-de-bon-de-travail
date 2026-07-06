# Module `portal` — Portail client (B21)

## Rôle

Espace en libre-service pour les clients finaux (fiches `Client`) :

| Capacité | Détail |
|---|---|
| Consultation | Tous les BT du client — demandes en attente, planifiés/en cours (statut + date, champs restreints), complétés |
| Rapports | Téléchargement du PDF (`GET /reports/work-orders/:id/pdf`) — **BT terminaux seulement** |
| Demandes de travail | Crée un vrai BT **sans date** au statut « Demandé » (code process 50, enum `REQUESTED`), à approuver/rejeter par ADMIN/DISPATCHER |

Accès par **invitation admin uniquement** : bouton « Inviter au portail » sur la fiche client → compte `User { role: CLIENT, clientId }` + courriel avec lien d'activation (`/portail/activation?token=…`, TTL 7 jours, SHA-256 en DB — même posture que `EmailVerification`). Révocation = `PATCH /users/:id { isActive: false }`.

## Surface API

| Méthode | Route | Rôles |
|---|---|---|
| `POST` | `/portal/invitations` | ADMIN (ré-appeler = renvoyer, invalide les tokens actifs) |
| `POST` | `/portal/activate` | `@Public` (throttlé 10/min) |
| `GET` | `/portal/work-orders`, `/portal/work-orders/:id` | CLIENT — `where clientId`, select sanitisé, 404 si étranger |
| `GET` | `/portal/addresses`, `/portal/task-types` | CLIENT |
| `POST` | `/portal/work-requests` | CLIENT (throttlé 10/min) |

Le select sanitisé (`PORTAL_WORK_ORDER_SELECT` dans `application/portal.service.ts`) est le **contrat complet** de ce qu'un client voit d'un BT — jamais de notes internes, `templateData`, audit ni coordonnées du technicien (au plus `assignedTo.firstName`).

## Statut « Demandé »

- Flag `ProcessStatus.isRequested` (cohérent avec `isInitial`/`isDispatch`/…) ; `mapToLegacyStatus` le teste en premier → `WorkOrderStatus.REQUESTED`.
- Seed + **backfill idempotent au boot** (`process-seed.service.ts backfillRequestedStatus`) : chaque `ProcessDefinition` de chaque tenant reçoit le statut 50 « Demandé » + transitions `50→isInitial « Approuver la demande »` et `50→isTerminalNegative « Rejeter la demande »` (ADMIN/DISPATCHER, `negativeReason` requis au rejet).
- `WorkOrdersService.create(dto, user, { asRequest: true })` : démarre à `requestedStatus` au lieu de `initialStatus` ; 409 si le processus n'a pas de statut Demandé.

## Domain events

### `workOrders.workOrder.requested` (émis par work-orders)

| Champ data | Type |
|---|---|
| `referenceNumber` | string |
| `title` | string |
| `taskTypeId` | string \| null |
| `clientId` | string \| null |

Émis **en plus** de `created` quand `asRequest: true`. Consommé par :
- `notifications.listener` — fan-out in-app + courriel à tous les ADMIN/DISPATCHER (préférence `workOrder.requested`, activée par défaut) ;
- moteur d'alertes (`ALERT_PUBLISHABLE_EVENTS`) — règles configurables.

### `portal.invitation.issued` (émis par portal)

| Champ | Type |
|---|---|
| `email`, `link`, `clientName`, `tenantName?` | string |

Consommé par `notifications.listener` → `EmailChannelService` (courriel bilingue FR/EN ; fallback console sans SMTP — le lien est aussi loggé par `PortalInvitationService`).

### Réaction à `clients.client.deleted`

`PortalClientEventsListener` désactive les comptes CLIENT liés au client supprimé. La suppression client est un **soft delete** (`isActive=false`, la ligne survit), donc `User.clientId` reste renseigné et le ciblage est direct. Une ré-invitation sur le même client réactive le compte.

## Sécurité

- `RolesGuard` laisse passer **tout rôle authentifié** sur une route sans `@Roles` → les routes staff nues ont été fermées avec `@Roles(ADMIN, DISPATCHER, TECHNICIAN)` (work-orders ×8, settings ×5, calendar, attachments ×3, dashboard). Contrat verrouillé par `portal.permissions.spec.ts` (metadata Reflect).
- `users.service.findAll` exclut `CLIENT` par défaut (gestion depuis la fiche client, pas la page Utilisateurs).
- Les comptes CLIENT ne consomment **pas** le quota `maxUsers` (déjà bornés par `maxClients`).
- Garde PDF : `role===CLIENT && wo.clientId !== user.clientId → 403` ; non-terminal → 403.
- `PortalInvitation` est dans `TENANT_SCOPED_MODELS` ; `activate()` passe par du SQL brut (route publique — le contexte tenant peut être le fallback DEFAULT, le token est la racine de confiance, même posture que `JwtStrategy.validate`).

## Frontend

- Sous-arbre `/portail/*` : garde `ClientRoute` + `PortalLayout` dédié (jamais `AppLayout` — redirect défensif dans les deux sens). Racine `/` route CLIENT → `/portail`.
- Pages : `PortalWorkOrdersPage` (liste + PDF), `PortalWorkOrderDetailPage`, `PortalRequestPage`, `PortalActivationPage` (publique).
- i18n : namespace `portal` (fr/en). Libellés de statut : `currentStep.nameFr/nameEn` (fallback badge legacy `REQUESTED` → « Demandé »).
- Admin : section « Portail client » dans le détail client (`ClientsPage`), carte « Demandes à approuver » au dashboard (`stats.pendingRequests`).
