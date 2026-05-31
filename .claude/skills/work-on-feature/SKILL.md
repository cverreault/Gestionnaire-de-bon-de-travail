---
name: work-on-feature
description: Implémenter une feature de bout en bout en respectant l'architecture modulaire et les ADRs de TaskMgr.
argument-hint: <feature-description>
---

# Work on Feature

Tu implémentes la feature : **$ARGUMENTS**.

Suis chaque étape ci-dessous **dans l'ordre**. Ne saute aucune étape.

> Si une permission ou un tool te bloque, dis-le clairement au lieu de skipper en silence — l'utilisateur t'autorisera et tu réessaieras.

---

## Step 1 — Comprendre la demande

1. Identifie quel **module** est concerné (`backend/src/modules/{name}/` ou un nouveau module).
2. Lis :
   - [CLAUDE.md](../../../CLAUDE.md) — conventions du projet.
   - [docs/adrs/](../../../docs/adrs/) — décisions architecturales (commence par ADR-001, ADR-003).
   - [docs/modules/dispatch-logic.md](../../../docs/modules/dispatch-logic.md) si la feature touche la logique de répartition.
   - Le code existant du module ciblé pour comprendre les patterns en place.
3. Si la demande est ambiguë ou contredit une ADR, **arrête-toi et demande clarification** avant d'écrire du code.

## Step 2 — Planifier l'implémentation

Présente un plan court (≤ 200 mots) couvrant :
- **Quelle couche** : Domain / Application / Infrastructure / Api
- **Quels fichiers** créer ou modifier (chemins exacts)
- **Quels domain events** publier ou consommer
- **Quels DTOs** (Create / Update / Query)
- **Quels validators** (class-validator + i18nValidationMessage)
- **Quelle migration Prisma** si schéma modifié
- **Quels tests** (unit + integration)

Attends l'approbation utilisateur avant de coder.

## Step 3 — Implémenter

### Backend

**Architecture (ADR-001)**
- Respecter les couches : `domain/` (entités, events) → `application/` (services, DTOs) → `infrastructure/` (repos Prisma) → `api/` (controllers)
- **Aucun import direct** entre modules métier (`work-orders/` ne peut pas importer de `clients/`). Passer par events ou interfaces partagées dans `backend/src/common/contracts/`.
- Utiliser le `PrismaService` injecté, pas instancier un `PrismaClient` ad-hoc.

**DTOs et validation**
- Utiliser `class-validator` + `class-transformer`
- Messages d'erreur via `i18nValidationMessage('validation.KEY')` — jamais de string hardcodée dans `message:`
- DTOs séparés HTTP (api/) vs business (application/) seulement si réellement divergents

**Auth (ADR-004)**
- Toute route est `JwtAuthGuard`'d par défaut. Pour public : `@Public()`
- Restriction de rôle : `@Roles(Role.ADMIN, Role.DISPATCHER)`
- Pour les permissions au niveau ressource (ex: « tech voit seulement ses BT »), filtrer dans le service avec `currentUser`

**Domain events**
- Publier via `EventEmitter2.emit('namespace.aggregate.verb', payload)`
- Convention : `{moduleId}.{aggregate}.{verb-past-tense}` (ex: `workOrders.workOrder.assigned`)
- Payload typé via interface dans `domain/events/`
- Subscriber via `@OnEvent('namespace.aggregate.verb')` dans `application/event-handlers/`

**Migrations Prisma**
- Toujours : `docker compose exec backend npx prisma migrate dev --name {snake_case_description}`
- Jamais `prisma db push` en code commité
- Migration nommée explicitement (`{YYYYMMDDHHMMSS}_add_field_to_table`)

### Frontend

**Architecture**
- Pages : `frontend/src/pages/`
- Composants réutilisables : `frontend/src/components/`
- Hooks data : `frontend/src/hooks/use{Resource}.ts` (React Query)
- Service HTTP : `frontend/src/services/{resource}.service.ts`
- Types : `frontend/src/types/index.ts`

**i18n (ADR-005)**
- **Toujours** utiliser `useTranslation('namespace')` puis `t('key')`
- Ajouter les clés dans `frontend/src/locales/{fr,en}/{namespace}.json`
- Pour les pluriels : `t('count', { count: n })` avec `count_one`, `count_other`
- Format dates via `formatDate()` de `utils/dateFormat.ts` (locale-aware)

**Theme (ADR-006)**
- Utiliser `theme.colors.X` (résout vers `var(--c-X)`)
- Jamais de hex hardcodé (`#1e40af`) — ajouter une variable CSS si besoin

**Tests UI**
- Si la feature affecte une page existante, ajouter/mettre à jour un test Vitest dans `frontend/src/tests/`

## Step 4 — Tester

**Backend**
- Unit tests : `application/services/*.spec.ts`
- Integration tests : route REST avec auth — vérifier 200/401/403/422 selon rôle
- Test des permissions : chaque endpoint doit avoir un test qui vérifie le rejet pour un rôle non autorisé

**Frontend**
- Vitest : composant principal + edge cases (formulaire vide, erreur API, success)

**Commande** :
```bash
cd backend && npm test
cd frontend && npm test
```

## Step 5 — Documentation

Si la feature est non-triviale :

1. **Module spec** : mettre à jour `docs/modules/{module}.md` (créer depuis `_MODULE_SPEC_TEMPLATE.md` si nouveau)
2. **ADR** : si une nouvelle décision architecturale a été prise (ex: « on persiste les notifications en DB plutôt qu'en mémoire ») → créer une ADR
3. **CLAUDE.md** : ajouter le nouveau module à la liste des modules existants

## Step 6 — Vérification finale

Avant de soumettre :

- [ ] **Lint** : `cd backend && npm run lint` (et frontend)
- [ ] **Type check** : `cd frontend && npx tsc --noEmit`
- [ ] **Tests** : passent
- [ ] **Migration** : appliquée dans le container (`docker compose exec backend npx prisma migrate status`)
- [ ] **Rebuild** : `docker compose up --build -d backend frontend` puis vérifier `docker logs taskmgr_backend` sans erreur
- [ ] **Smoke test** : tester l'endpoint avec curl ou via l'UI
- [ ] **Commit conventionnel** : `feat({module-name}): {description}` ou `fix({module-name}): ...`

## Step 7 — Rapport

Rapporte brièvement (≤ 150 mots) :
- Ce qui a été implémenté
- Fichiers principaux créés/modifiés
- Events publiés/consommés
- Tests ajoutés
- TODOs ou points en suspens

---

## Anti-patterns à éviter

- ❌ Importer un module métier depuis un autre (ex: `import { ClientsService } from '../clients/...'`)
- ❌ Hardcoder une string FR ou EN dans le code (toujours via i18n)
- ❌ Mocker la DB pour les tests d'intégration
- ❌ Utiliser `prisma db push` en production
- ❌ Modifier directement `WorkOrder.currentStepId` sans passer par `ProcessEngineService`
- ❌ Stocker la business logic dans le controller (toujours dans `application/services/`)
- ❌ Skipper la validation côté backend (ne pas faire confiance au frontend)
- ❌ Mettre un hex de couleur en dur (utiliser `var(--c-X)` via `theme.ts`)
