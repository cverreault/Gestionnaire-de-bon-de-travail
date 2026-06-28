# ADR-007: Extension points et contrats de module

| Field        | Value                          |
|-------------|-------------------------------|
| **Status**  | Accepted                       |
| **Date**    | 2026-06-28                     |
| **Authors** | Carl Verreault, Claude (AI Architect) |
| **Tags**    | architecture, contracts, extensibility, ddd |
| **Depends on** | [ADR-001](ADR-001-modular-monolith-architecture.md), [ADR-003](ADR-003-dispatch-engine.md) |

## Context

TaskMgr v1 est arrivé avec ~11 modules et l'architecture modulaire est documentée (ADR-001). Mais en pratique, on observe déjà 9 violations « cross-module imports » dans le code, et la roadmap prévoit l'arrivée de **6-10 nouveaux modules** dans les 6 prochains mois : `notifications`, `audit`, `reports`, `inventaire`, `dispatch-ia`, `gps`, intégrations diverses.

Sans contrats publics formels, ces nouveaux modules vont :
- importer en cascade les services des modules existants (re-coupler ce qu'ADR-001 voulait découpler)
- dupliquer la logique d'event-publication (chaque module réinvente son format)
- rendre les tests d'intégration impossibles (mock 5 services pour tester un workflow)
- compliquer la suppression/désactivation d'un module (ex : si on retire `notifications`, qu'est-ce qui casse ?)

Référence : VigilOS a résolu ce problème via des interfaces explicites (`IModuleRegistration`, `IEnricher<T>`, `IHoursContributor`, `IPostEventAction`, etc.) — chaque module s'enregistre et déclare ses points d'extension. C'est ce qui permet à leur module `events-orchestration` de plugger dans `personnel`, `schedule`, `stations` sans toucher leur code.

## Decision

Nous adoptons trois types de contrats explicites dans `backend/src/common/contracts/`, qui sont **la seule porte d'entrée** autorisée entre modules métier.

### 1. `IDomainEvent` — events de domaine

**Pattern** : publish-subscribe via `EventEmitter2` (déjà câblé en A1).

**Quand l'utiliser** : side-effect différé, fire-and-forget, pas de valeur de retour à exploiter.

**Exemples** :
- `workOrders.workOrder.assigned` → `notifications` envoie un push au technicien
- `workOrders.workOrder.completed` → `audit` persiste l'entry, `reports` met à jour KPI

**Implémentation** : voir [domain-event.interface.ts](../../backend/src/common/contracts/domain-event.interface.ts).

Chaque event doit contenir `eventId`, `aggregateId`, `occurredAt`, `actorUserId`. Les factories type-safe sont dans `{module}/domain/events/` du module publisher.

### 2. `IWorkOrderHook` — hooks synchrones avec influence

**Pattern** : injection de tableau (`@Inject(WORK_ORDER_HOOKS) hooks: IWorkOrderHook[]`), itération synchrone par le `WorkOrdersService`.

**Quand l'utiliser** : opération qui doit terminer **avant** la réponse HTTP, ou qui peut **influencer/annuler** le résultat.

**Exemples futurs** :
- `inventaire.workOrderHook` → `onCompleting` vérifie le stock, **throw** si négatif
- `dispatch-ia.workOrderHook` → `onCreated` suggère un technicien (résultat enrichi dans la réponse)
- `audit.workOrderHook` → `onStatusChanged` persiste l'entry avant que le client ne reçoive la réponse (garantie de cohérence)

**Implémentation** : voir [work-order-hook.interface.ts](../../backend/src/common/contracts/work-order-hook.interface.ts).

> NOTE : le contrat est **défini mais pas encore branché** par `WorkOrdersService`. Branchement reporté à l'arrivée du premier consommateur réel (sprint 5, module Inventaire). Sinon on ajoute de la complexité sans bénéfice immédiat — YAGNI.

### 3. `IModuleRegistration` — métadonnées de module

**Pattern** : chaque module exporte une constante `{ModuleName}Registration: IModuleRegistration` déclarée comme provider NestJS.

**Quand l'utiliser** : description statique du module pour validation, doc, page admin.

**Implémentation** : voir [module-registration.interface.ts](../../backend/src/common/contracts/module-registration.interface.ts).

Champs :
- `moduleId`, `version`, `type: 'core' | 'optional'`
- `dependsOn: string[]`
- `publishedEvents: string[]` et `consumedEvents: string[]`
- `onBootstrap?()` — hook one-shot au démarrage

**Service futur** (sprint 2) : `ModuleRegistryService` qui collecte tous les `IModuleRegistration` au boot et :
- valide que les `dependsOn` sont satisfaites
- valide qu'aucun `consumedEvents` ne référence un event non publié
- expose `/api/admin/modules` (admin only) pour visualisation

### 4. Quand utiliser **quel** mécanisme

| Besoin | Mécanisme | Synchrone ? | Peut annuler ? |
|---|---|---|---|
| Notification fire-and-forget | `IDomainEvent` | Non (async) | Non |
| Audit log persisté avant la réponse | `IWorkOrderHook.onStatusChanged` | Oui | Non |
| Validation métier qui peut annuler | `IWorkOrderHook.onCompleting` | Oui | **Oui** (throw) |
| Enrichissement de la réponse API | `IWorkOrderHook` | Oui | Non |
| Description du module | `IModuleRegistration` | — | — |

### 5. Règle d'or (ADR-001 §3 réaffirmée)

> Un module métier **ne peut importer que** depuis `backend/src/common/contracts/` (ou son propre dossier).
>
> Vérifié automatiquement par `npm run arch:check` (dependency-cruiser) à chaque PR.

### 6. Hors scope

- Pas de **Mediator pattern** pour les Commands (write). Si besoin un jour : ADR à créer.
- Pas de **interceptors WorkOrdersService** qui modifieraient le retour HTTP — les hooks restent en service, pas en bordure HTTP.
- Pas de **runtime ABAC engine** (les hooks ne servent pas à faire de la RBAC). Pour les permissions : `@Roles` + check `currentUser.id` dans le service.

---

## Consequences

### Positives
- **Modules vraiment plug-and-play** : ajouter `notifications` revient à créer un `notifications.module.ts` qui consomme `workOrders.*` events. Zéro modification du module `work-orders`.
- **Tests isolés** : chaque module testable sans charger le reste de l'app.
- **Documentation auto-générée** : la page `/api/admin/modules` listera tous les modules + events.
- **Validation au boot** : dépendances mal déclarées sortent comme erreur explicite, pas comme bug runtime.
- **dependency-cruiser** garantit que la règle reste respectée même avec un nouveau dev qui ne lit pas les ADRs.

### Négatives / Trade-offs
- **Verbosité initiale** : créer un event ou un hook = 3-5 fichiers (interface, factory, listener, doc). On l'accepte pour la lisibilité.
- **Hooks risquent l'overuse** : la tentation de tout faire en hook (synchrone, peut annuler) au lieu de events (async, fire-and-forget) augmente le coupling. Mitigation : faire la règle 4 (« quel mécanisme ») partie du onboarding + review systématique.
- **Versionning des events** : un changement de shape d'event = breaking change pour les consommateurs. Pas encore de stratégie de versioning ; à introduire avant le premier upgrade incompatible (probablement v2).

### Risques
- **Performance** : un hook bloquant lent ralentit toutes les requêtes. Mitigation : timeout obligatoire dans `WorkOrdersService.runHooks()` (à implémenter quand on branche le premier hook).
- **Cycle de hooks** : un hook qui émet un event consommé par un autre hook qui émet… Mitigation : ne pas brancher les hooks tant qu'on n'a pas un détecteur de cycle.

---

## Alternatives considered

### Alternative A : tout en events (pas de hooks)
**Pour** : Architecture pure, totalement async.
**Contre** : Impossible d'annuler une opération depuis un autre module (le BT est déjà commit en DB quand l'event arrive). Cas légitimes perdus.
**Rejetée** : on veut le levier d'annulation (ex : « stock négatif → annule la complétion »).

### Alternative B : full Mediator (CQRS-style)
**Pour** : Pattern carré, séparation Command / Query nette.
**Contre** : Overkill pour TaskMgr v1, ajoute 2-3 fichiers par opération, courbe d'apprentissage.
**Rejetée** : on évalue en v2 si la complexité justifie.

### Alternative C : ne rien faire, importer directement
**Pour** : Zéro nouveau code.
**Contre** : la dette explose dans 6 mois, refacto coûteux.
**Rejetée** : ADR-001 est claire, on l'applique.

---

## Implementation notes

### Fichiers livrés
- [backend/src/common/contracts/domain-event.interface.ts](../../backend/src/common/contracts/domain-event.interface.ts)
- [backend/src/common/contracts/work-order-hook.interface.ts](../../backend/src/common/contracts/work-order-hook.interface.ts)
- [backend/src/common/contracts/module-registration.interface.ts](../../backend/src/common/contracts/module-registration.interface.ts)
- [backend/src/common/contracts/index.ts](../../backend/src/common/contracts/index.ts) — barrel public
- [backend/.dependency-cruiser.cjs](../../backend/.dependency-cruiser.cjs) — règles d'architecture

### npm scripts
```bash
npm run arch:check    # Vérifie le respect des règles (CI-ready)
npm run arch:report   # Génère un graphe HTML interactif
```

### Roadmap d'utilisation
- **Sprint 2 (audit)** : premier vrai consommateur — `audit.module.ts` consomme tous les events `workOrders.*` et persiste en DB.
- **Sprint 3 (notifications)** : `notifications.module.ts` consomme `workOrders.workOrder.assigned`, fournit `INotificationChannel` impls (email, push web).
- **Sprint 5 (inventaire)** : premier vrai consommateur de hooks — `inventaire.workOrderHook` implémente `onCompleting`.

### Dette technique acceptée
9 couplages cross-module pré-existants documentés en exception dans le fichier dep-cruiser (cf. `// Dette : ...` TODOs). À éliminer progressivement :
- `process-engine`/`process-cache` partagés → à promouvoir en service partagé hors module
- `templates.service.filterTemplateForUser` → à déplacer dans `common/`
- `attachments/minio.service` consommé par `backup` → introduire `IBackupContributor`

## References
- VigilOS `IModuleRegistration`, `IEnricher<T>`, `IHoursContributor` (inspiration)
- [Modular Monolith — Simon Brown](https://www.codingthearchitecture.com/2014/07/24/modular_monoliths.html)
- [Hexagonal Architecture — Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)
