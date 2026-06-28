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

---

## État de la suite Jest

| Métrique | Avant sprint | Après sprint |
|---|---|---|
| Suites passantes | 6 / 8 | **9 / 9** |
| Tests passants | 192 / 200 | **226 / 226** |
| Violations dependency-cruiser | 0 | 0 |

Toutes les nouvelles couches (auth, RBAC, audit, throttler) sont
couvertes par des unit tests. Reste à ajouter les tests d'intégration
object-level (un TECHNICIEN tente de lire un BT pas le sien → 403)
qui nécessitent une DB de tests dédiée — décision infra reportée.

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
