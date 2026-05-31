# ADR-001: Modular Monolith en Clean Architecture

| Field        | Value                          |
|-------------|-------------------------------|
| **Status**  | Accepted                       |
| **Date**    | 2026-05-14                     |
| **Authors** | Carl Verreault, Claude (AI Architect) |
| **Tags**    | architecture, modularity, clean-architecture, ddd |

## Context

TaskMgr est un système de répartition de tâches pour techniciens terrain. Il commence comme un outil pour une seule organisation (single-tenant, self-hosted) mais doit pouvoir grandir avec les besoins du métier :

- Ajout futur de modules (facturation, inventaire, GPS technicien, notifications push, etc.)
- Possibilité de découper en services indépendants si la volumétrie l'exige (>1 000 BT/jour)
- Maintenance par un développeur senior + assistant IA (Claude) — la lisibilité prime
- Stack NestJS+Prisma déjà choisie (voir ADR-002)

L'enjeu : **éviter le big-ball-of-mud** typique des projets NestJS qui grossissent (services qui s'importent en cascade, couplage fort, impossibilité de retirer une feature sans casser les autres).

## Decision

**Modular Monolith en Clean Architecture**. Chaque module métier est une unité isolée avec ses propres couches Domain/Application/Infrastructure/Api. Les modules communiquent uniquement par **events de domaine** (`@nestjs/event-emitter`) ou **interfaces partagées** (`backend/src/common/`).

### 1. Structure d'un module

```
backend/src/modules/{module-name}/
├── domain/
│   ├── entities/         # Aggregates et entités métier (types TS partagés avec Prisma)
│   ├── value-objects/    # Strongly-typed IDs, enums, types
│   └── events/           # Events de domaine publiés par ce module
├── application/
│   ├── services/         # Services NestJS (use cases / orchestration métier)
│   ├── dto/              # CreateXxxDto, UpdateXxxDto, queries
│   └── validators/       # Si validation complexe non couverte par class-validator
├── infrastructure/
│   ├── persistence/      # Repositories Prisma (impl. des interfaces de domain/)
│   ├── external/         # Clients vers APIs externes (ex: SMS, push notif)
│   └── {module}.module.ts # NestJS module — DI + exports
└── api/
    ├── {module}.controller.ts  # Controllers REST (couche mince)
    └── dto/                    # DTOs HTTP (si différents des DTOs application)
```

### 2. Règles de dépendance

| Couche | Peut dépendre de |
|---|---|
| `api/` | `application/`, `domain/` |
| `application/` | `domain/` |
| `infrastructure/` | `domain/`, `application/` (pour impl.) |
| `domain/` | Rien (sauf SharedKernel) |

**Aucune couche ne peut dépendre de `infrastructure/`** sauf via injection de dépendance (interface en `domain/`, impl. en `infrastructure/`).

### 3. Communication inter-module

Deux mécanismes autorisés, jamais d'import direct :

**A. Domain events** (« quelque chose s'est passé »)
- Publication via `EventEmitter2` (`@nestjs/event-emitter`)
- Convention de nommage : `{module}.{aggregate}.{verb-past-tense}` — ex: `workOrders.workOrder.assigned`
- Payload typé via interface dans `domain/events/`
- Subscribers déclarés via `@OnEvent()` dans le module receveur
- Pas de garantie de delivery (eventual consistency) — pour les events critiques, ajouter un outbox pattern plus tard

**B. Shared interfaces** (« j'ai besoin d'un service »)
- Interfaces publiques dans `backend/src/common/contracts/`
- Implémentation dans le module fournisseur (ex: `INotificationService` implémenté par `notifications.module.ts`)
- Injection via token NestJS (`@Inject(INotificationService)`)

### 4. Shared Kernel

`backend/src/common/` ne contient que :
- Décorateurs (`@Roles`, `@Public`, `@CurrentUser`)
- Guards (`JwtAuthGuard`, `RolesGuard`)
- Interceptors (`TransformInterceptor`)
- Filters (`HttpExceptionFilter`)
- Pipes (`I18nValidationPipe`)
- Service Prisma (`PrismaService`)
- Types de base (`AuditableEntity`, `Pagination`)

**Ce qui n'y appartient pas** : logique métier, entités d'un module, helpers spécifiques à un domaine.

### 5. Schema database

Les tables Prisma sont **regroupées par module logique** dans `schema.prisma` (commentaires de section). À terme, si la stack évolue, chaque module pourra avoir son propre schéma Postgres (`@@schema("work_orders")`).

### 6. Hors scope

- Pas de **monorepo multi-package** pour l'instant — un seul `backend/` et un seul `frontend/`.
- Pas de **multi-tenancy** — l'app est self-hosted single-org. La couche est prête à l'ajouter (toutes les requêtes passent par `PrismaService`).
- Pas de **service mesh / orchestration K8s** — Docker Compose suffit.

---

## Consequences

### Positives
- **Isolation forte** : on peut retirer un module entier sans casser le reste (à part les events orphelins, traçables via tests).
- **Lisibilité** : un nouveau dev comprend `work-orders/` sans avoir besoin de toute la codebase.
- **Testabilité** : la couche `application/` est testable sans DB.
- **Évolutivité vers microservices** : la frontière modulaire = la frontière de service future.
- **Compatible avec Claude** : un assistant peut travailler sur un module sans charger toute la base.

### Négatives / Trade-offs
- **Plus de fichiers** que dans un service NestJS « plat » — on accepte la verbosité pour la clarté.
- **Risque de duplication** : si deux modules ont besoin du même helper, il faut décider (commons ou duplicate). Règle : duplicate jusqu'à la 3ème occurrence (rule of three).
- **Events sync vs async** : `EventEmitter2` est synchrone par défaut. Pour le découplage temporel (ex: notif push qui ne doit pas bloquer la réponse HTTP), basculer sur BullMQ + Redis (ADR à créer).

### Risques
- **Dérive vers le big-ball-of-mud** si la discipline se relâche → mitigation : tests d'architecture (lint custom ou `dependency-cruiser`) qui interdisent les imports inter-modules directs.
- **Schema Postgres unique** : si un module fait des opérations lourdes (ex: rapport sur 6 mois de données), les autres modules en pâtissent. Mitigation : indexes spécifiques + read replicas plus tard.

---

## Alternatives considered

### Alternative A : Service NestJS classique « par feature »
**Pour** : Familiarité, moins de fichiers.
**Contre** : Pas de barrière entre modules → couplage fort à terme.
**Rejetée** : déjà ressenti pendant les phases 1-3 du projet.

### Alternative B : Microservices d'emblée (1 service par module)
**Pour** : Isolation parfaite, scalabilité indépendante.
**Contre** : Complexité opérationnelle énorme pour un seul dev, latence réseau, coût Docker.
**Rejetée** : prématuré pour la volumétrie actuelle (~50 BT/jour).

### Alternative C : Event Sourcing complet (EventStore, projections)
**Pour** : Audit trail naturel, replay possible.
**Contre** : Complexité 10× au-dessus du besoin pour une CRUD app principalement.
**Rejetée** : on garde le pattern Repository sur Postgres avec events de notification.

---

## Implementation notes

- **Migration progressive** : les modules existants (`clients`, `work-orders`, `process`, etc.) ne respectent pas encore strictement la séparation Domain/Application/Infrastructure. Plan de mise en conformité dans [docs/modules/refactor-plan.md](../modules/refactor-plan.md) (à créer).
- **Tests d'architecture** : à mettre en place avec `eslint-plugin-boundaries` ou `dependency-cruiser` (interdire `import { X } from '../{otherModule}/...'`).
- **Conventions de commit** : `feat({module-name}): ...` permet de tracer les changements par module.

## References
- [Modular Monoliths — Simon Brown](https://www.codingthearchitecture.com/2014/07/24/modular_monoliths.html)
- [Clean Architecture — Uncle Bob](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- Inspiration : VigilOS [`docs/adrs/ADR-003`](https://github.com/VSL-technologies/VigilOS) (Modular Monolith en .NET)
