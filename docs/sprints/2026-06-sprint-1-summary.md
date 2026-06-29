# Sprint 1 — Quick wins, sécurité auth, observabilité

**Période** : juin 2026
**Branche** : `main`
**Commits** : 14 (de `5a43ccb` à `e73f446` + cleanup)

## Objectifs

Sortie de la baseline ADR-007 (events + contracts + dependency-cruiser).
Sprint 1 attaque trois axes en parallèle :

1. **Quick wins UX** sur les trois personas (Admin, Dispatcher, Technicien)
2. **Hardening sécurité** : RBAC objet, rotation tokens, rate limit effectif
3. **Observabilité prod-ready** : audit, smoke test au boot, log structuré

L'angle directeur est de fermer les angles morts cités dans le panorama
de valeur — pas d'introduire de nouveau scope.

---

## Livraisons

### Quick wins UX

| # | Commit | Cible | Description |
|---|---|---|---|
| **A3** | `ed2c8ed` | Dispatcher | Export CSV de la liste BT respectant les filtres actifs (`GET /api/work-orders/export.csv`, ADMIN+DISPATCHER, cap 5000 lignes, BOM UTF-8 pour Excel) |
| **A4** | `62722eb` | Tous | Fiche imprimée du BT enrichie : résolution client V3, valeurs de template, section complétion (heures effectives + notes + résultat) |
| **A5** | `a9c4c04` | Dispatcher | Filtres BT sauvegardés en localStorage (selecteur + 💾 + 🗑) |
| **A6** | `5a43ccb` | Technicien | Timeline d'audit visible au technicien sur ses propres BT (RBAC objet) |
| **A7** | `001cf89` | Dispatcher | Bouton « 🗐 Dupliquer » sur le détail BT — clone titre/type/client/template, reset technicien/dates |
| **A8** | `ed52bc7` | Tous | Indicateurs visuels 📝 + tooltip sur boutons transition listant les champs requis |
| **A9** | `3f748b6` | Technicien | Chip live « 🚗 En route depuis MM:SS » dérivé du journal d'audit (zéro migration) |

### Hardening sécurité

| # | Commit | Description |
|---|---|---|
| **C6** | `80ed1c4` | Refresh tokens DB-backed (table `refresh_tokens`), rotation à chaque refresh, détection de replay → kill toute la famille. SHA-256 du JWT seul est persisté. |
| **C7** | `0235e54` | Rate limit **effectivement appliqué** (avant : headers leaked, zéro contrainte). Custom `UserScopedThrottlerGuard` qui bucket par `user:<id>` après auth, `ip:<addr>` sinon. Health endpoints exemptés. |
| **C13** | `e73f446` | RolesGuard émet un log structuré `security.access.denied` sur chaque refus (ressource, méthode, userId, role, rôles attendus) — détection de scans IDOR par lecture de logs. |

> Hot-fix Sprint 0 (avant ce sprint) : IDOR sur `GET /clients/:id` et `GET /calendar/appointments/:id` qui leakaient les données vers TECHNICIAN. Réglé en ajoutant `@Roles(ADMIN, DISPATCHER)` et verrouillé par la matrice de permissions ci-dessous.

### Prod-readiness

| # | Commit | Description |
|---|---|---|
| **C11** | `93025e8` | Boot smoke test : exécute les indicators DB + MinIO avant `app.listen()`. Si rouge, exit 1 + log clair. Catch les déploiements cassés au moment du déploiement, pas une heure plus tard en monitoring. |

### Tests

| # | Commit | Description |
|---|---|---|
| **C4 (partiel)** | `ddcf99d` | 12 tests sur `AuthService` : login, rotation, replay, family kill, logout, expiry, disabled user. |
| **C4 (partiel)** | `80b92cf` | 41 assertions déclaratives sur la matrice `@Roles` (work-orders, clients, users, calendar, audit, backup) — anti-régression IDOR. |
| **C13** | `e73f446` | 4 tests sur `RolesGuard` : allow / deny+log / anonyme+log / no-metadata bypass. |
| **cleanup** | `4a89a9f` | 8 tests pré-existants ressuscités (constructor BT manquant, prefix TaskType devenu requis, BUG-04 sortOrder fix verification). |

### Module audit user-facing complet (post-sprint follow-up)

| # | Commit | Description |
|---|---|---|
| **B2 admin page** | `a8e7bf3` | Page `/audit` paginée + filtrable (eventName, aggregateId, plage occurredAt) + lien drill-down depuis la timeline d'un BT |
| **B2 CSV export** | `337962f` | `GET /audit/export.csv` (ADMIN, cap 5000 lignes) + bouton sur la page |
| **B2 drill-down + actor filter** | `e3bd974` | Sur la timeline d'un BT (ADMIN), lien « 🔍 Voir dans l'audit complet → » → `/audit?aggregateId=…` ; dropdown « Acteur » sur la page (populé via `/users`) |
| **B2 spec backend** | `9bee48c` | 16 cases sur `AuditService` (record idempotence, RBAC objet, filtres pagination, exportCsv BOM/cap 5000) |

### Documentation + tooling

| # | Commit | Description |
|---|---|---|
| **Docs modules** | `dc5ddaf` | Specs `audit.md`, `auth.md`, `search.md` sous `docs/modules/` |
| **C12 step 1** | `6b116b3` | Backend `noImplicitAny: true` — 5 erreurs fixées (toutes en fixtures) |
| **C12 step 2** | `7abd8a1` | Backend `strictBindCallApply: true` — 0 erreurs |
| **C12 step 3** | `8ff8381` | Backend `strictNullChecks: true` — 0 erreurs |
| **C5 Playwright** | `270f222` | Setup `@playwright/test` + 2 specs (smoke nav + lifecycle complet) + README |

### B1 — Notifications multi-canaux (post-Sprint 1 extension)

Premier vrai consommateur cross-module non-`audit`. Valide l'archi événementielle de bout en bout : un module isolé reçoit `workOrders.workOrder.assigned`, persiste une row, dispatche sur trois canaux selon les préférences user, sans toucher au module publisher.

| # | Commit | Description |
|---|---|---|
| **B1.1.a** | (foundation) | Module backend complet : Prisma `Notification` + migration, service avec RBAC objet, listener sur `workOrder.assigned`, controller `/me/notifications` (list / mark read / mark all read), 9 tests |
| **B1.1.b** | (frontend) | `NotificationsBell` (badge + dropdown 360px) intégré dans `AppLayout` admin et tech (floating bell pour la vue mobile) ; React Query poll 30s |
| **B1.1.c** | `c682259` | Canal **email** via nodemailer ; opt-in `SMTP_HOST` ; fallback CONSOLE mode qui log la payload dans Pino |
| **B1.2** | (preferences) | Modèle typé `NotificationPreferences`, defaults par event+canal, endpoints `/me/notifications/preferences` (GET/PUT), section UI sur `/profil` (matrice événement × canal), listener consulte avant chaque canal |
| **B1.3** | (web push) | Canal **push** via web-push + VAPID ; modèle `PushSubscription` + migration ; service worker `src/sw.ts` (push handler + notificationclick + workbox precache + API NetworkFirst) ; bouton « Activer » sur `/profil` ; 3 endpoints (`vapid-public-key`, `subscribe`, `unsubscribe`) |
| **Docs** | (polish) | `docs/modules/notifications.md`, lien drill-down actor sur timeline BT, release notes v2.1.3 |

Stack technique :
- `nodemailer` 9.x pour SMTP
- `web-push` 3.x + `@types/web-push`
- `workbox-precaching/routing/strategies/expiration` 7.x pour le SW custom (passage de `generateSW` à `injectManifest`)

Posture symétrique sur les deux canaux opt-in (email + push) :
- Variables d'env absentes → mode **CONSOLE** (warn au boot + log de la payload, jamais d'erreur)
- Variables présentes → canal actif, échecs (4xx, 410, etc.) gérés par retry simple côté nodemailer ou cleanup automatique côté push (subscription gone)
- `channelsSent` JSONB reflète exactement ce qui a réussi, lisible dans la page admin `/audit`

### B4 — SLA + escalades (post-Sprint 1 extension #2)

Premier vrai consommateur métier du pipeline notifications. Boucle complète bout-en-bout : configuration admin (slaHours par type) → calcul automatique au create → cron de détection → fan-out via B1 → UI badge + filtre.

| # | Commit | Description |
|---|---|---|
| **B4.a** | `bc00848` | Schema : `task_types.sla_hours` + `work_orders.sla_target_at` + `work_orders.sla_breached_at` + migration. `WorkOrdersService.create()` calcule `sla_target_at` au create, immuable. DTO `CreateTaskTypeDto.slaHours` + 4 tests |
| **B4.b** | (cron) | `SlaCheckService` `@Cron('*/15 * * * *')` — scanne les BT actifs en breach, set `sla_breached_at`, émet `workOrders.workOrder.slaBreached`. Cap 100 rows/run, batch try/catch par row. 7 tests |
| **B4.c** | `9fbd15c` | `NotificationsListener.onWorkOrderSlaBreached` — fan-out vers `{assignedToId + ADMIN + DISPATCHER}` dédupliqués. `dispatchOne()` helper partagé entre `assigned` et `slaBreached`. Préférence `workOrder.slaBreached` (defaults : tous canaux ON). 6 tests |
| **B4.d** | `1a40258` | `SlaBadge` component (3 états : Retard / Bientôt / hidden) sur 3 surfaces (détail BT, table admin, card tech). Backend filter `slaBreached` sur `WorkOrderFilterDto` + bouton toggle UI persisté localStorage |

Stack technique : juste `@nestjs/schedule` (déjà installé pour B2 cleanup). Pas de nouvelle dépendance.

Posture : SLA est **opt-in par type**. Un type sans `slaHours` ne génère jamais de cible, jamais de breach, jamais d'event. Le passage d'un type sans SLA à un type avec SLA n'affecte pas les BT existants (la cible est figée au create).

Validation end-to-end : un type avec `slaHours: 1`, créer un BT, attendre 1h + 15min → push notification automatique sur tech + admins, badge rouge sur les 3 surfaces UI, event visible dans `/audit?eventName=workOrders.workOrder.slaBreached`.

### SA — Super-Admin configuration plateforme (post-Sprint 1 extension #3)

Préparation de la trajectoire SaaS (B6 lointain mais explicite) : nouveau tier `SUPER_ADMIN` au-dessus d'`ADMIN`, store de configs runtime chiffré, UI dédiée.

| # | Commit | Description |
|---|---|---|
| **SA.1.a** | (foundation) | Enum `Role.SUPER_ADMIN` (Postgres ALTER TYPE ADD VALUE), `RolesGuard` inheritance one-way (SA passe toutes les routes ADMIN-gated, l'inverse non), `SuperAdminBootstrapService` qui promote `SUPER_ADMIN_EMAIL` au boot. 7 tests bootstrap + 2 tests guard |
| **SA.1.b** | (configs) | Table `system_configs` (key/value/encrypted/updatedBy), helper `aes-gcm.ts` (AES-256-GCM via node:crypto), `SystemConfigService` avec resolver hiérarchique DB > env > undefined + clé maître `CONFIG_MASTER_KEY` SHA-256-derived. 9 tests crypto + 13 tests service + envKeyFor |
| **SA.2.a** | (api + refactor) | `SuperAdminController` (`GET/PUT/DELETE /super-admin/configs/:key`) gated `@Roles(SUPER_ADMIN)`. Event `systemConfigs.config.changed` émis sur chaque write. `EmailChannelService` lit à chaque send via `resolve()`. `PushChannelService` lit au boot + `@OnEvent` pour rafraîchir VAPID sans restart. Module event-driven decoupling (pas de cycle SystemConfigsModule ↔ NotificationsModule). 4 lignes ajoutées au roles-matrix |
| **SA.2.b** | (frontend) | `Role.SUPER_ADMIN` côté front, `SuperAdminRoute` guard, page `/super-admin` avec sections curées (📨 SMTP / 🔔 VAPID / 🐛 Sentry / 📦 Audit), inline editor + toggle « 🔐 Chiffrer », sidebar entry "Plateforme" SA-only, `AdminOnlyRoute` accepte aussi SUPER_ADMIN (héritage one-way) |

Posture sur les secrets :
- `CONFIG_MASTER_KEY` jamais en DB, jamais en git — vit dans `.env`. Sa rotation rend les valeurs chiffrées illisibles : à traiter comme `JWT_SECRET`.
- Sans clé maître, le service refuse les écritures chiffrées mais sert les rows plaintext. Les déploiements existants ne cassent pas — ils ne peuvent juste pas ajouter de secrets via l'UI tant qu'ils n'ont pas posé `CONFIG_MASTER_KEY`.
- Le bootstrap SA est idempotent : `SUPER_ADMIN_EMAIL` peut rester défini après la promotion, le service no-op tant qu'un SA actif existe.

Multi-tenancy (B6) : **non implémenté**, intentionnellement. La table `system_configs` n'a pas encore de `tenant_id` — décision : on l'ajoute quand B6 démarre, c'est un ALTER TABLE non-breaking. Le rôle SUPER_ADMIN est déjà en place pour ne pas avoir à refactoriser la couche RBAC plus tard.

---

## État de la suite Jest

| Métrique | Avant sprint | Après sprint |
|---|---|---|
| Suites passantes | 6 / 8 | **11 / 11** |
| Tests passants | 192 / 200 | **244 / 244** |
| Violations dependency-cruiser | 0 | 0 |

Toutes les nouvelles couches (auth, RBAC, audit, throttler) sont
couvertes par des unit tests. La matrice de permissions verrouille
43 décorateurs `@Roles` (Sprint-0 IDOR fix sur `GET /clients/:id` y
compris). Reste à ajouter les tests d'intégration object-level (un
TECHNICIEN tente de lire un BT pas le sien → 403) qui nécessitent
une DB de tests dédiée — décision infra reportée.

E2E Playwright (C5) : 2 specs (smoke nav admin, lifecycle complet
admin → tech). Skip propre sans `E2E_*` env vars ; instructions dans
`frontend/e2e/README.md`.

## TypeScript strict (C12)

Sur le backend, trois flags strict famille activés sans aucune
régression :

| Flag | Avant | Après | Erreurs surfacées |
|---|---|---|---|
| `noImplicitAny` | off | on | 5 (toutes en fixtures de test) |
| `strictBindCallApply` | off | on | 0 |
| `strictNullChecks` | off | on | 0 |

Restent à traiter : `strictPropertyInitialization` (~40 fichiers
Nest avec injection de dépendances) et `useUnknownInCatchVariables`.
Le frontend est en `strict: true` depuis la baseline.

---

## Couverture par persona

| Persona | Items livrés |
|---|---|
| **Admin** | A3 export, A4 fiche imprimée enrichie, C6 refresh DB, C7 rate limit, C11 boot smoke, C13 RBAC log |
| **Dispatcher** | A3, A5 filtres, A7 dupliquer, A4 fiche imprimée |
| **Technicien** | A4 fiche, A6 timeline audit, A9 timer EN_ROUTE |

---

## Items en attente de décision utilisateur

| # | Décision requise |
|---|---|
| **A4** suite | Génération PDF côté serveur via puppeteer/pdfkit (vs `window.print()`) |
| **C8** | CSP stricte — accepte-t-on de retirer les inline styles ? |
| **C9** | Backup nocturne — destination (S3 distant / volume local / autre) ? |
| **C10** | Sentry — créer un compte et fournir le DSN |
| **B6** | Multi-tenancy — pivot SaaS ou rester self-hosted ? |

---

## Sprint 2 — Pré-requis identifiés

- **B1 notifications** débloqué : audit (B2) et events sont en place, première utilisation des `IWorkOrderHook` à valider.
- **B2 audit** suffisant pour la timeline UI (A6) ; la page admin globale `/audit` reste à câbler.
- **C4 suite** demande une stratégie DB de tests pour les vérifications object-level RBAC service.
- **C12 TS strict** : ~50 occurrences de `any` recensées, attaquable progressivement.

---

## Architecture — ce qui n'a PAS changé

- Aucun nouveau module métier (le sprint reste dans les contrats ADR-001/007).
- Aucun ADR créé (toutes les décisions tiennent dans ADR-004 auth + ADR-007 contracts).
- Aucune dépendance majeure ajoutée (juste l'usage de `@nestjs/throttler` qui était déjà là mais non câblé).

---

## Verification & test plan

Tests automatiques :

```bash
cd backend && npm test                  # 226 / 226 green
cd backend && npm run arch:check        # 0 violations
cd frontend && npx tsc --noEmit         # 0 errors
```

Tests manuels (UI) :

- **A3** : Liste BT → appliquer filtres → bouton « ⬇ Exporter CSV » → ouvre dans Excel.
- **A5** : Liste BT → configurer filtres → 💾 Enregistrer → recharger page → choisir le preset.
- **A6** : En tant que TECHNICIEN, ouvrir son BT → la section « 📜 Historique » s'affiche.
- **A7** : Détail BT (admin) → « 🗐 Dupliquer » → redirige vers le nouveau BT en CREATED.
- **A8** : Détail BT → boutons transition affichent 📝 + tooltip si modale requise.
- **A9** : Tech transitionne son BT en EN_ROUTE → chip jaune « En route depuis MM:SS » tick chaque seconde.
- **C6** : Login → refresh token → reload page → toujours connecté ; en DB, voir la rotation dans `refresh_tokens`.
- **C7** : `for i in {1..25}; do curl http://localhost:3800/api/auth/login -X POST -d '{}' -H 'Content-Type: application/json'; done` → 5 réponses 401 puis 429.
- **C11** : Tuer Postgres → redémarrer backend → exit 1 + log `💥 Boot smoke test FAILED — database: ...`.
- **C13** : Tenter un endpoint admin avec un JWT TECHNICIEN → 403 + log `RBAC denied: user=... role=TECHNICIAN required=[ADMIN] ...`.
