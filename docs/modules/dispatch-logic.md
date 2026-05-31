# Logique de répartition de tâche — Spec métier

> **C'est le cœur du système.** Ce document décrit la logique métier de répartition d'un BT vers un technicien.
> Tout changement à ce flow doit créer ou amender une ADR.

## Vocabulaire

| Terme | Définition |
|---|---|
| **BT** (Bon de travail) | Unité de travail confiée à un technicien terrain. Représente une intervention. |
| **Type de tâche** | Catégorie métier (Plomberie, Électricité, Standard…). Détermine le préfixe du numéro de référence, le template à appliquer, et le processus à utiliser. |
| **Processus** | Workflow d'états et de transitions configurable. Chaque type de tâche peut avoir le sien. |
| **Statut** (Process status) | Un état dans un processus (Créé, Assigné, En route, etc.). |
| **Transition** | Passage d'un statut A vers un statut B. Conditionnée par rôle et champs requis. |
| **Dispatcher** | Personne qui crée et répartit les BT. |
| **Technicien** | Personne qui exécute le BT sur le terrain. |
| **Template** | Formulaire structuré (sections + champs) attaché à un type de tâche. Saisi pendant l'intervention. |

---

## Le flow standard

```
┌─────────────────┐
│   1. Création   │  Dispatcher → bouton « + Nouveau BT »
└────────┬────────┘    Choix du type → résolution du processus + template
         │             Saisie : titre, client, adresse, date prévue, priorité
         ▼
┌─────────────────┐
│ 2. État initial │  Statut « Créé » (code 0, isInitial=true)
│   (CREATED)     │  Event publié : workOrders.workOrder.created
└────────┬────────┘
         │
         │  Dispatcher choisit un technicien (sélection ou drag-and-drop sidebar)
         ▼
┌─────────────────┐
│  3. Assignation │  Statut « Assigné » (code 100)
│   (ASSIGNED)    │  WorkOrder.assignedToId = userId
│                 │  Event : workOrders.workOrder.assigned
└────────┬────────┘
         │
         │  Dispatcher confirme l'envoi (DispatchConfirmModal)
         ▼
┌─────────────────┐
│ 4. Répartition  │  Statut isDispatch=true (par convention code 200 « Réparti »)
│  (DISPATCHED)   │  Event : workOrders.workOrder.dispatched
│                 │  → Déclenchera notification push au technicien (futur)
└────────┬────────┘
         │
         │  Technicien part (transition « En route »)
         ▼
┌─────────────────┐
│  5. En route    │  Statut « En route » (code 300)
│   (EN_ROUTE)    │  Event : workOrders.workOrder.statusChanged
└────────┬────────┘
         │
         │  Technicien arrive sur place (transition « En cours »)
         ▼
┌─────────────────┐
│  6. En cours    │  Statut « En cours » (code 400, isStart=true)
│  (IN_PROGRESS)  │  Le tech remplit le template, ajoute notes/photos
└────────┬────────┘
         │
         │  Technicien termine (positif ou négatif)
         ▼
┌─────────────────┐    ┌─────────────────┐
│ 7a. Terminé (+) │ ou │ 7b. Terminé (-) │
│   (COMPLETED_   │    │   (COMPLETED_   │
│   POSITIVE)     │    │   NEGATIVE)     │
└─────────────────┘    └─────────────────┘
   Event final         Event final
   workOrders.workOrder.completed { outcome: 'positive' | 'negative' }
```

---

## Variations possibles

Le processus est **configurable**. Trois exemples livrés en seed :

### Processus « Standard BT » (défaut, 7 statuts)
Le flow complet ci-dessus.

### Processus « Simple » (5 statuts)
Pour les organisations qui n'ont pas besoin de tracking En route / En cours :
```
Créé → Assigné → Réparti → Terminer positif | Terminer négatif
```

### Processus personnalisé (à créer par l'admin)
Exemple : ajouter une étape « Approbation officier » avant « Réparti » :
```
Créé → Évalué → Approuvé → Assigné → Réparti → En route → En cours → Terminé(+/-)
```

---

## Règles d'invariants

### Création d'un BT
1. Le BT a forcément un `taskTypeId` (ou utilise le défaut).
2. Le BT a forcément un `processDefinitionId` résolu à la création (via `TaskType.processDefinitionId` ou défaut).
3. Le BT a forcément un `currentStepId` qui pointe sur le statut initial du processus.
4. Si un `assignedToId` est fourni à la création, le BT démarre directement en `Assigné` (shortcut).
5. Le `referenceNumber` est généré : `{prefix}-{YYYYMMDD}-{0001}` (séquence quotidienne par préfixe).

### Transitions
1. Une transition n'est valide que si :
   - `(fromStatusId, toStatusId)` existe dans `process_transitions` pour le `processDefinitionId` courant
   - `user.role` est dans `transition.allowedRoles`
   - Tous les champs de `transition.requiredFields` sont renseignés sur le BT
2. Une transition vers un statut **terminal** verrouille le BT — plus aucune autre transition possible.
3. Un BT ne peut **jamais changer de processus** après sa création (`processDefinitionId` immuable).

### Assignation
1. Un BT a au plus **un seul technicien assigné** (`assignedToId`).
2. Pour réassigner : modifier `assignedToId` (l'API renvoie une erreur si le BT est en statut terminal).
3. Pas de **multi-assignation** en v1.

### Permissions par défaut
| Rôle | Peut faire |
|---|---|
| ADMIN | Toute transition sur tout BT |
| DISPATCHER | Toute transition pré-terminale, assignation, réassignation |
| TECHNICIAN | Uniquement transitions sur **ses propres BT** (où `assignedToId == userId`) |

---

## Points d'extension

Pour les modules futurs :

### Module Notifications (à venir)
- Écoute `workOrders.workOrder.dispatched` → notification push au tech
- Écoute `workOrders.workOrder.assigned` → email au tech (option)
- Écoute `workOrders.workOrder.completed` → notification au client (option)

### Module Audit (à venir)
- Écoute tous les events `workOrders.*` → table `audit_log` (qui, quand, quoi)

### Module GPS / Routing (à venir)
- Écoute `workOrders.workOrder.dispatched` → calcul ETA via API Mapbox/Google
- Écoute `workOrders.workOrder.statusChanged` (vers EN_ROUTE) → tracking position tech

### Module Reporting (à venir)
- Lecture des events historiques → KPIs (temps moyen de résolution, taux de terminaison positive, charge par technicien)

---

## Anti-patterns à éviter

1. ❌ **Hardcoder un statut dans le code** (ex: `if (wo.status === 'ASSIGNED')`) — utiliser `wo.currentStep.isDispatch` ou la convention de codes.
2. ❌ **Court-circuiter le `ProcessEngineService`** pour faire une transition directe sur Prisma — toujours passer par le service qui vérifie les invariants.
3. ❌ **Coupler un module à `work-orders` via import** — passer par events.
4. ❌ **Modifier le `currentStepId` sans publier d'event** — le module `audit` perd la trace.
5. ❌ **Stocker la business logic dans le controller** — toujours dans `application/services/`.

---

## Tests obligatoires

Pour toute modification de la logique de répartition :

1. **Test unitaire** : `ProcessEngineService.assertTransitionAllowed(...)` couvre les 3 conditions (existence, rôle, champs requis).
2. **Test d'intégration** : `POST /work-orders/:id/transition` avec différents rôles et statuts → assertions sur le statut résultant + events publiés.
3. **Test E2E (à venir)** : Playwright vérifie le flow complet création → réparti → terminé pour un dispatcher et un tech.

---

## Diagramme entité-relation (extrait)

```
TaskType ─── 1:1 ──→ ProcessDefinition
   │
   │ 1:N
   ▼
WorkOrder
   │     │
   │     └── currentStep_rel ──→ ProcessStatus (currentStepId FK)
   │     └── processDef_rel  ──→ ProcessDefinition (processDefinitionId FK)
   │     └── assignedTo_rel  ──→ User (assignedToId FK)
   │     └── client_rel      ──→ Client (clientId FK)
   │     └── clientAddress_rel ─→ ClientAddress (clientAddressId FK)
   │     └── taskType_rel    ──→ TaskType (taskTypeId FK)
   │
   │ 1:N
   ▼
WorkOrderNote, WorkOrderAttachment

ProcessDefinition ─── 1:N ──→ ProcessStatus
                  ─── 1:N ──→ ProcessTransition (fromStatusId, toStatusId)
```

---

## Refs
- [ADR-003 : Moteur de répartition](../adrs/ADR-003-dispatch-engine.md)
- [backend/src/modules/process/](../../backend/src/modules/process/)
- [backend/src/modules/work-orders/](../../backend/src/modules/work-orders/)
