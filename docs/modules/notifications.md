# Module: notifications

| Field | Value |
|---|---|
| **Type** | Core |
| **Status** | Implemented |
| **Phase** | 3 (B1) |
| **ADR References** | [ADR-001](../adrs/ADR-001-modular-monolith-architecture.md), [ADR-007](../adrs/ADR-007-extension-points-and-contracts.md) |
| **Owner** | Carl Verreault |

## Purpose

Premier vrai consommateur cross-module non-`audit`. Traduit les domain events business en notifications utilisateur sur trois canaux : in-app (dropdown UI), email (SMTP), et Web Push (service worker). Chaque canal est opt-in côté serveur (env) et opt-in côté utilisateur (préférences `/profil`).

L'objectif n'est pas "envoyer un email", c'est "valider l'architecture événementielle de bout en bout" : un module isolé reçoit les events workOrders.**, fait ses side-effects sans toucher au module publisher. Aucun changement au module `work-orders` n'a été nécessaire pour ajouter cette fonctionnalité.

## Personas servis

| Persona | Usage |
|---|---|
| **Tous** | 🔔 cloche dans le top-bar (admin/dispatcher) ou flottante (technicien) — badge du nombre non-lus, dropdown des 20 derniers |
| **Tous** | Section « Préférences de notifications » sur `/profil` — matrice événement × canal |
| **Technicien** | Cas d'usage principal : recevoir une notif dès qu'on lui assigne un BT, sans avoir à F5 |

## Capabilities

- Persiste une `Notification` row par destinataire pour chaque event écouté (status `PENDING` → `SENT` quand au moins un canal réussit)
- Channel `in-app` : la row est suffisante, lue via `GET /me/notifications`
- Channel `email` : `EmailChannelService` via nodemailer, opt-in via `SMTP_HOST` (fallback console)
- Channel `push` : `PushChannelService` via web-push + service worker browser, opt-in via VAPID keys (fallback console)
- Préférences utilisateur sparses sur `User.preferences.notifications` — listener filtre les canaux avant dispatch
- Mark-as-read individuel + bulk
- Émet `notifications.notification.sent` quand un canal a réussi → consommé par `audit` (timeline de delivery)
- Idempotence : replay des events n'est pas dédupliqué côté notifications (un re-emit crée une nouvelle row) — à voir si problème en pratique

## API publique

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/me/notifications` | tous (self-service) | `{ items, unreadCount }` — 20 plus récentes, non-lus en tête |
| `PATCH` | `/api/me/notifications/:id/read` | tous (self-service, IDOR check) | Marque une notif comme lue |
| `PATCH` | `/api/me/notifications/read-all` | tous | Marque tout comme lu |
| `GET` | `/api/me/notifications/preferences` | tous | `{ preferences, events }` avec defaults appliqués |
| `PUT` | `/api/me/notifications/preferences` | tous | Sparse patch, shallow-merge avec existant |
| `GET` | `/api/me/notifications/push/vapid-public-key` | tous | Pour PushManager.subscribe (404 si VAPID pas configuré côté serveur) |
| `POST` | `/api/me/notifications/push/subscribe` | tous | Enregistre la souscription PushManager |
| `DELETE` | `/api/me/notifications/push/subscribe` | tous | Retire une souscription |

RBAC objet : `markRead` vérifie `notification.userId === currentUser.id` (sinon 404, jamais 403 pour ne pas leaker l'existence d'une notif d'un autre user).

## Domain events publiés

| Event | Quand | Payload |
|---|---|---|
| `notifications.notification.sent` | Une notif a été dispatched sur au moins un canal | `{ userId, type, channels }` |

Consommé automatiquement par `audit` via le wildcard listener (timeline de delivery).

## Domain events consommés

| Event source | Action |
|---|---|
| `workOrders.workOrder.assigned` | Crée une notif `workOrder.assigned` pour le tech assigné, dispatche sur les canaux opt-in |

À étendre : `workOrder.completed`, `workOrder.statusChanged` (escalade SLA), `auth.passwordReset` (lien magique), etc.

## Données possédées

### `notifications` (Prisma : `Notification`)
- `id` UUID PK
- `userId` — destinataire (no FK cascade — soft delete préserve l'historique)
- `type` — clé catégorielle (ex: `workOrder.assigned`)
- `title`, `body?`
- `aggregateId?` — pour deep-link (workOrderId, etc.)
- `data` JSONB — payload event d'origine
- `status` — `PENDING` / `SENT` / `FAILED` / `READ`
- `channelsSent` JSONB — array des canaux qui ont réussi
- `sentAt?`, `readAt?`, timestamps

Indexes : `(user_id, read_at, created_at DESC)` (inbox), `(status, created_at)` (retries)

### `push_subscriptions` (Prisma : `PushSubscription`)
- `id` UUID PK, `userId`
- `endpoint` (UNIQUE) — URL fournie par le browser
- `p256dh`, `auth` — clés d'encryption
- `userAgent?`, `createdAt`, `lastUsedAt?`

## Dépendances

| Module | Type | Pourquoi |
|---|---|---|
| `users` | soft (lecture Prisma directe) | Résoudre l'email du destinataire dans le listener — pas d'import de `UsersService` (ADR-001 §3) |
| `common/contracts` | hard | `IDomainEvent` |

Pas de dépendance sur un module métier. Le listener reste « observateur passif » de la bus d'events.

## Configuration env

```
# Email (B1.1.c) — opt-in
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
NOTIFICATIONS_FROM="TaskMgr <noreply@example.com>"

# Web Push (B1.3) — opt-in
# Générer avec: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:noreply@example.com
```

Sans `SMTP_HOST` → email channel en mode CONSOLE (log).
Sans `VAPID_PUBLIC_KEY/PRIVATE_KEY` → push channel en mode CONSOLE (log).

## Tests

- **Unit** : `notifications.service.spec.ts` — 13 cases (create, markSent, findForUser unread-first, markRead avec RBAC, markAllRead, preferences defaults/merge/persist).
- **Permissions** : 5 lignes dans `roles-matrix.spec.ts` (tous ANY-auth, self-service).

À écrire : tests d'intégration listener (event → notif row + canaux selon prefs), tests pour `PushChannelService` (subscribe upsert + 410 cleanup).

## Open questions

- Dédup / idempotence : si un même event est rejoué (debug, replay audit), on crée une 2e row. À comparer avec `audit` qui dédupe sur `eventId`.
- TTL des notifications dans l'inbox : 1000 BT * 50 events → 50k rows par tech vite. Sweep nocturne similaire à audit ?
- Retry des canaux qui ont 5xx — actuellement on log et on passe. Avec BullMQ on pourrait retry les `FAILED` rows.
- Templating email : aujourd'hui plain text hardcodé dans le listener. Sortir vers `infrastructure/templates/` quand le 3e type d'event arrive.
- Multi-device push : un user avec 3 navigateurs reçoit 3 push pour une notif → comportement voulu, mais peut-être bruyant si un device est endormi.
- Notifications pour les ADMIN/DISPATCHER aussi : aujourd'hui le listener cible uniquement le tech assigné. Un dispatcher voudrait peut-être savoir « un BT a été refusé / completé en échec ».

## Refs
- B1.1.a commit `(foundation)` — module + model + listener + inbox
- B1.1.b commit `(frontend)` — bell + dropdown
- B1.1.c commit `c682259` — canal email
- B1.2 commit — préférences typées
- B1.3 commits — Web Push (backend + frontend SW)
- `frontend/src/sw.ts` — service worker avec push handler
- `frontend/src/utils/pushRegistration.ts` — helper enable/disable
