import type { Role } from '@prisma/client';

/**
 * Hook que les modules tiers (notifications, audit, reporting, inventaire,
 * dispatch-IA…) implémentent pour réagir aux moments-clés du cycle de vie
 * d'un BT — **de façon synchrone**.
 *
 * **Quand utiliser un hook vs un event ?**
 *
 *   - Domain event (`EventEmitter2`) → side-effect différé, fire-and-forget,
 *     pas de valeur de retour. Le publisher continue son flux.
 *     Ex : envoyer une notif push, persister un entry audit.
 *
 *   - Hook (cette interface) → opération synchrone qui doit avoir terminé
 *     **avant** que la réponse HTTP ne parte, ou qui peut **influencer** le
 *     résultat (annulation, enrichissement).
 *     Ex : module `inventaire` qui vérifie le stock avant complétion,
 *     module `dispatch-ia` qui propose un technicien à l'assignation.
 *
 * **Pattern d'enregistrement** : chaque module fournit son hook via un token
 * NestJS partagé (`WORK_ORDER_HOOKS`). `WorkOrdersService` injecte le tableau
 * et itère.
 *
 * Voir : docs/adrs/ADR-007 §3 (à venir).
 *
 * NOTE : ce contrat est **défini mais pas encore utilisé** par
 * `WorkOrdersService` — il sera branché quand le premier consommateur
 * arrivera (ex : module Inventaire en sprint 5). Le brancher prématurément
 * ajouterait de la complexité sans bénéfice.
 */
export interface IWorkOrderHook {
  /** Identifiant unique du hook, utile pour log et debug. */
  readonly hookId: string;

  /** Appelé après que le BT est persisté en DB. */
  onCreated?(
    wo: WorkOrderHookSnapshot,
    ctx: HookContext,
  ): Promise<void>;

  /** Appelé après une assignation (changement de `assignedToId`). */
  onAssigned?(
    wo: WorkOrderHookSnapshot,
    previousTechnicianId: string | null,
    ctx: HookContext,
  ): Promise<void>;

  /** Appelé après le passage au statut `isDispatch=true`. */
  onDispatched?(
    wo: WorkOrderHookSnapshot,
    ctx: HookContext,
  ): Promise<void>;

  /** Appelé après tout changement de statut (granularité fine). */
  onStatusChanged?(
    wo: WorkOrderHookSnapshot,
    fromStatusId: string | null,
    toStatusId: string,
    ctx: HookContext,
  ): Promise<void>;

  /**
   * Appelé avant la complétion. Peut **throw** pour annuler la complétion
   * (ex : « stock négatif, complétion refusée »).
   * `outcome` indique si c'est terminal positif ou négatif.
   */
  onCompleting?(
    wo: WorkOrderHookSnapshot,
    outcome: 'positive' | 'negative',
    ctx: HookContext,
  ): Promise<void>;

  /** Appelé après que le BT est marqué terminal. */
  onCompleted?(
    wo: WorkOrderHookSnapshot,
    outcome: 'positive' | 'negative',
    ctx: HookContext,
  ): Promise<void>;
}

/**
 * Snapshot minimal du BT passé aux hooks. Volontairement plat (pas de
 * relations Prisma) pour éviter le couplage à un shape spécifique.
 */
export interface WorkOrderHookSnapshot {
  readonly id: string;
  readonly referenceNumber: string;
  readonly status: string;
  readonly currentStepId: string | null;
  readonly processDefinitionId: string | null;
  readonly taskTypeId: string | null;
  readonly clientId: string | null;
  readonly assignedToId: string | null;
  readonly title: string;
  readonly priority: number;
}

/**
 * Contexte injecté dans chaque hook. Évite les hooks qui « plongent dans
 * les services » en cascade — toute donnée utile est servie ici.
 */
export interface HookContext {
  /** Utilisateur à l'origine de l'action (null pour events système). */
  readonly currentUser: { id: string; role: Role } | null;

  /** Locale active de la requête, propagable aux notifications i18n. */
  readonly locale: 'fr' | 'en';

  /** Permet à un hook d'émettre un event additionnel (pas obligatoire). */
  emitEvent(name: string, payload: unknown): void;
}

/** Token DI partagé pour fournir le tableau de hooks au WorkOrdersService. */
export const WORK_ORDER_HOOKS = Symbol('WORK_ORDER_HOOKS');
