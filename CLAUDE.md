# TaskMgr — Instructions Claude Code

## Projet
**TaskMgr** est un système de **répartition de tâches** (work-order dispatch) pour techniciens terrain. Il remplace les feuilles Excel et les outils ad-hoc utilisés par les petites équipes (≤ 50 BT actifs / jour). Bilingue FR/EN, mode clair/sombre, déployé en self-hosted Docker.

**Personas servis** :
| Persona | Usage |
|---|---|
| **Admin** | Configuration : types de tâches, processus, templates, utilisateurs, sauvegardes |
| **Dispatcher** | Création et répartition des BT, suivi du parc actif, drag-and-drop sur technicien |
| **Technicien** | Vue mobile/tablette de ses BT actifs, transitions de statut, photos/notes terrain |

## Stack Technologique
- **Backend** : NestJS 10 (TypeScript) sur Node.js 20 LTS — `backend/`
- **Frontend** : React 18 + Vite + Zustand + React Query — `frontend/`
- **Base de données** : PostgreSQL 16 (Prisma ORM)
- **Stockage fichiers** : MinIO (S3-compatible)
- **Cache/Queue** : *À introduire si besoin (Redis + BullMQ)*
- **Reverse proxy** : Nginx — `nginx/`
- **i18n** : `nestjs-i18n` (backend), `react-i18next` (frontend), JSON par namespace
- **Auth** : JWT (access + refresh), 3 rôles : ADMIN / DISPATCHER / TECHNICIAN
- **Tests** : Jest + Supertest backend, Vitest frontend (à étoffer)
- **Déploiement** : Docker Compose unique stack

## Architecture

**Modular Monolith en Clean Architecture** (voir [ADR-001](docs/adrs/ADR-001-modular-monolith-architecture.md)).

Chaque module backend respecte 4 couches :
```
backend/src/modules/{module}/
├── domain/         # Entités, value objects, événements de domaine
├── application/    # Services métier, validators, DTOs
├── infrastructure/ # Repositories Prisma, intégrations externes
└── api/            # Controllers NestJS (couche mince — délègue à application)
```

**Modules existants** (`backend/src/modules/`) :
- `auth` — authentification, JWT, refresh tokens
- `users` — utilisateurs + préférences UI (theme, locale, columns)
- `clients` — clients + adresses (rattachées ou orphelines)
- `work-orders` — bons de travail (aggregate central)
- `process` — moteur de processus (states, transitions, validation des permissions)
- `templates` — templates de formulaires par type de BT (sections + champs custom)
- `settings` — types de tâches, types de clients, types d'emplacements + champs custom par type
- `attachments` — pièces jointes (MinIO)
- `calendar` — événements calendrier (BT planifiés)
- `dashboard` — statistiques admin et technicien
- `backup` — sauvegarde/restauration

**Communication inter-module** :
- ✅ Via **events NestJS** (`@nestjs/event-emitter`) — pattern `domain.events.*`
- ✅ Via **interfaces partagées** (`common/`)
- ❌ Jamais via import direct entre modules métier

**Logique de répartition de tâche** ([docs/modules/dispatch-logic.md](docs/modules/dispatch-logic.md)) :
- BT créé → statut `CREATED`
- BT assigné à technicien → statut `ASSIGNED` (+ event `WorkOrderAssigned`)
- Dispatcher confirme → statut `DISPATCHED` (+ event `WorkOrderDispatched`)
- Tech en déplacement → `EN_ROUTE`
- Tech sur place → `IN_PROGRESS`
- Tech termine → `COMPLETED_POSITIVE` ou `COMPLETED_NEGATIVE`

Les transitions sont **configurables par processus** (`process_definitions`) avec rôles autorisés et champs requis par transition.

## Conventions de Code

**Langue du code** : anglais (variables, fonctions, classes, commentaires).
**Langue de l'UI** : bilingue FR/EN via i18n.
**Langue des messages d'erreur API** : traduits via header `Accept-Language` (nestjs-i18n).

**Nommage** :
- Fichiers : `kebab-case.ts` (ex: `work-order.service.ts`)
- Classes : `PascalCase` (ex: `WorkOrderService`)
- Variables / fonctions : `camelCase`
- Tables DB : `snake_case` pluriel (ex: `work_orders`)
- Colonnes DB : `snake_case` (mappées via `@map` Prisma)
- Constantes : `SCREAMING_SNAKE_CASE`
- IDs : UUID v4 (sauf préfixe métier comme reference number `STD-20260514-0001`)

**Dates** : `TIMESTAMPTZ` en DB (UTC), formatage locale-aware via `frontend/src/utils/dateFormat.ts`.
**Données flexibles** : JSONB (templateData sur WO, typeData sur Address, preferences sur User).

## Conventions API REST
- Préfixe : `/api/`
- Ressources au pluriel : `/clients`, `/work-orders`, `/process`
- Versioning : non versionné pour l'instant (intégrer `/v1/` si breaking change)
- Pagination : `?page=1&limit=20` (max 100)
- Tri : `?sort=createdAt&order=desc`
- Filtrage : `?status=ASSIGNED&type=REPAIR`
- Recherche : `?search=foo`
- Format de réponse : `{ success: true, data: T, timestamp: ... }` (TransformInterceptor)
- Format d'erreur : `{ statusCode, message, error?, timestamp, path, method }`
- Validation : `class-validator` + `class-transformer` via `I18nValidationPipe`
- Erreurs i18n : utiliser `i18nValidationMessage('validation.KEY')` dans les DTOs

## Conventions Tests
- Backend : `*.spec.ts` à côté du fichier testé
- Frontend : `*.test.ts` dans `frontend/src/tests/`
- Tests d'arch : vérifier qu'aucun module ne référence un autre directement
- Coverage min : 70 % sur Application Services (cibler 80 % en v1.0)
- Pas de mock de la DB pour les tests d'intégration — utiliser un Postgres dédié

## Commandes Principales
```bash
# Démarrage stack complet
docker compose up -d

# Rebuild backend ou frontend
docker compose up --build -d backend
docker compose up --build -d frontend

# Logs
docker logs taskmgr_backend --since 1m -f

# Migration Prisma (dans le container)
docker compose exec backend npx prisma migrate dev --name feature_x

# Lint
cd backend && npm run lint
cd frontend && npm run lint

# Tests
cd backend && npm test
cd frontend && npm test

# Connexion DB
docker exec -it taskmgr_postgres psql -U taskmgr -d taskmgr
```

## Documentation de Référence
- [ADRs](docs/adrs/) — décisions architecturales
- [Modules](docs/modules/) — spec par module métier
- [docs/modules/dispatch-logic.md](docs/modules/dispatch-logic.md) — logique de répartition (cœur du système)
- [.claude/skills/](.claude/skills/) — skills réutilisables pour Claude

## Règles Importantes
1. **Toujours respecter les ADRs** — si une décision les contredit, créer une nouvelle ADR avec `Supersedes`.
2. **Ne jamais importer un module métier depuis un autre** — passer par events ou interfaces partagées (`common/`).
3. **Ne jamais mocker la DB pour les tests d'intégration** — utiliser un Postgres dédié.
4. **Toujours utiliser `i18nValidationMessage` dans les DTOs** — pas de string hardcodée dans les `message:` de class-validator.
5. **Toujours créer une migration Prisma** pour les changements de schéma — `prisma db push` est interdit en production.
6. **Commits conventionnels** : `feat(work-orders): add bulk assignment` (scope = nom du module).
7. **Le frontend ne doit jamais appeler directement la DB** — uniquement via `/api/*`.
8. **Les secrets restent dans `.env`** (gitignored). `.env.example` documente la forme attendue.
9. **Tester les permissions** — chaque endpoint doit avoir un test qui vérifie le rôle requis.
10. **Documenter les domain events** — chaque event publié doit avoir sa fiche dans le module spec.
