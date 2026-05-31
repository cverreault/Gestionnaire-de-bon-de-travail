# ADR-003: Moteur de répartition de tâches

| Field        | Value                          |
|-------------|-------------------------------|
| **Status**  | Accepted                       |
| **Date**    | 2026-05-14                     |
| **Authors** | Carl Verreault, Claude (AI Architect) |
| **Tags**    | dispatch, workflow, business-core |
| **Depends on** | [ADR-001](ADR-001-modular-monolith-architecture.md) |

## Context

Le **cœur métier** de TaskMgr est la **répartition d'un bon de travail (BT) vers un technicien**, et le suivi du cycle de vie complet : `Créé → Assigné → Réparti → En route → En cours → Terminé`.

Les besoins varient d'un client à l'autre :
- Une équipe de plomberie veut juste : `Créé → Assigné → Terminé`
- Un service municipal veut : `Créé → Évalué → Approuvé → Assigné → Réparti → En route → En cours → Inspection → Terminé`
- Certains BT exigent des champs spécifiques avant transition (ex: photo avant `Terminé`)

Le moteur doit donc être **configurable par type de tâche**, sans toucher au code.

## Decision

### 1. Trois aggregates centraux

**`WorkOrder`** (BT) — l'unité de travail. Possède :
- `referenceNumber` : `{TYPE}-{YYYYMMDD}-{SEQUENCE}` (ex: `STD-20260514-0001`)
- `status` : enum legacy (`CREATED`, `ASSIGNED`, ...) maintenu pour rétrocompat
- `currentStepId` : FK vers `ProcessStatus` (la source de vérité)
- `processDefinitionId` : le processus appliqué (depuis le TaskType)
- `assignedToId` : FK vers User (technicien)
- `templateData` : JSONB — valeurs des champs du template

**`ProcessDefinition`** — un workflow. Possède :
- Plusieurs `ProcessStatus` (états du workflow, position ordonnée, flags `isInitial`, `isDispatch`, `isTerminalPositive`, `isTerminalNegative`)
- Plusieurs `ProcessTransition` (de A → B avec `allowedRoles`, `requiredFields`, `label`)

**`TaskType`** — le type métier (Plomberie, Électricité, Standard…). Possède :
- `prefix` (3-5 lettres, génère le `referenceNumber`)
- `processDefinitionId` (le processus à appliquer)
- `templateId` (le template de formulaire à appliquer)

### 2. Cycle de vie d'un BT

```
[Création]
  └─> TaskType.processDefinition résolu
       └─> currentStepId = processus.initialStatus
            └─> Event: WorkOrderCreated

[Assignation] (dispatcher choisit un tech)
  └─> Transition vers le statut "Assigné" (code 100)
       └─> WorkOrder.assignedToId = userId
            └─> Event: WorkOrderAssigned

[Répartition] (dispatcher confirme l'envoi)
  └─> Transition vers le statut isDispatch=true
       └─> Event: WorkOrderDispatched (déclencheur futur des notifications push)

[Exécution] (technicien)
  └─> Transitions En route → En cours → Terminé(+/-)
       └─> Event: WorkOrderStatusChanged à chaque transition

[Terminal]
  └─> Statut isTerminalPositive ou isTerminalNegative
       └─> Plus de transitions possibles
       └─> Event: WorkOrderCompleted
```

### 3. Validation d'une transition

Le service `ProcessEngineService.canTransition(workOrder, toStatus, user)` vérifie :

1. **L'utilisateur a-t-il un rôle autorisé ?**
   - `transition.allowedRoles` doit contenir `user.role`
2. **L'état actuel permet-il cette transition ?**
   - Une transition `(fromStatusId, toStatusId)` doit exister pour la `processDefinition` courante
3. **Les champs requis sont-ils renseignés ?**
   - `transition.requiredFields` (ex: `['attachments', 'completionNotes']`)
   - Validation au moment de l'appel (pas en mémoire)

Si une étape échoue, lève `ForbiddenException` ou `BadRequestException` avec message i18n.

### 4. Convention de codes de statut

Pour faciliter la résolution cross-process, les codes suivent une convention :

| Code | Signification | Flag |
|---|---|---|
| 0 | État initial | `isInitial=true` |
| 100 | Assigné à technicien | — |
| 200 | Réparti (dispatched) | `isDispatch=true` |
| 300+ | États intermédiaires | — |
| 4xx | Terminal positif | `isTerminalPositive=true` |
| 5xx | Terminal négatif | `isTerminalNegative=true` |

C'est une convention, pas une contrainte forte (les codes sont des entiers libres).

### 5. Cache des processus

Le `ProcessCacheService` charge en mémoire :
- Tous les processus actifs (snapshot complet : statuts + transitions)
- Un index `taskTypeId → processDefinitionId`

Le cache est invalidé quand :
- Un processus est modifié (`invalidate(processId)`)
- Un TaskType change de processus (`invalidateTaskType(taskTypeId)`)
- Bulk: tous les processus (`invalidateAll()`)

### 6. Domain events publiés par le module `work-orders`

| Event | Quand | Payload (extrait) |
|---|---|---|
| `workOrders.workOrder.created` | Création | `{ workOrderId, referenceNumber, taskTypeId, createdById }` |
| `workOrders.workOrder.assigned` | Statut → Assigné | `{ workOrderId, technicianId, assignedById }` |
| `workOrders.workOrder.dispatched` | Statut → Réparti | `{ workOrderId, technicianId }` |
| `workOrders.workOrder.statusChanged` | Toute transition | `{ workOrderId, fromStatusId, toStatusId, byUserId }` |
| `workOrders.workOrder.completed` | Statut terminal | `{ workOrderId, outcome: 'positive' \| 'negative' }` |

### 7. Clonage du processus par défaut

À la **création d'un nouveau processus**, les statuts et transitions du processus marqué `isDefault=true` sont **clonés** (avec mapping des IDs anciens → nouveaux). Ça évite à l'admin de tout reconstruire from-scratch.

### 8. Hors scope

- Pas de **SLA / délais** automatiques pour l'instant.
- Pas de **règles de routage automatique** (ex: « assigne au tech le plus proche ») — manuel ou drag-and-drop.
- Pas de **multi-techniciens** sur un BT — un seul `assignedToId`.
- Pas de **back-transitions** automatiques entre processus (un BT garde son `processDefinitionId` à vie).

---

## Consequences

### Positives
- **Zéro deploy** pour changer un workflow — l'admin reconfigure via `/parametres`.
- **Adaptable par client** — chaque organisation cale ses propres processus.
- **Traçabilité** : chaque transition publie un event qui sera consommé par le module `audit` (à créer).
- **Découplage** : le module `notifications` (à venir) écoutera `WorkOrderAssigned` sans coupler les deux modules.

### Négatives / Trade-offs
- **Compromis sur la rétrocompat** : maintenir `status` (enum legacy) ET `currentStepId` simultanément complexifie la lecture. Plan de retrait du `status` en v1.0 quand tous les BT auront un `currentStepId`.
- **Cache de processus** : si l'admin modifie un processus pendant qu'un BT est en cours, le cache invalide mais le BT en cours peut voir une transition apparaître/disparaître. Acceptable pour la v1.

### Risques
- **Configuration cassée** : un admin peut créer un processus sans terminal status → BT bloqués. Mitigation : validation à la création (`processService.validateConfig`) — à durcir.

---

## Alternatives considered

### Alternative A : Workflow hardcodé (enum + switch)
**Pour** : Simplicité du code.
**Contre** : Chaque nouveau client = redeploy.
**Rejetée** : la flexibilité prime.

### Alternative B : Moteur BPMN (Camunda, Flowable)
**Pour** : Très puissant, standard industrie.
**Contre** : Trop lourd pour 50 BT/jour, coût opérationnel + courbe d'apprentissage.
**Rejetée** : surdimensionné.

### Alternative C : State machine library (XState)
**Pour** : Bibliothèque éprouvée.
**Contre** : Configurations en code TypeScript → pas d'admin no-code.
**Rejetée** : on veut une config DB-driven.

---

## Implementation notes
- Module `work-orders` : aggregate root + transitions
- Module `process` : `ProcessDefinition`, `ProcessStatus`, `ProcessTransition`, `ProcessEngineService`, `ProcessCacheService`
- Validation des transitions dans `ProcessEngineService.assertTransitionAllowed()`
- Events publiés via `EventEmitter2` — namespace `workOrders.*`

## References
- [Workflow Patterns](http://www.workflowpatterns.com/)
- Inspiration : VigilOS EventTask orchestration (state machine sur EventTask)
