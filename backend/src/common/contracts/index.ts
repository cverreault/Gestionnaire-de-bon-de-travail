/**
 * Barrel public des contrats — point d'entrée unique pour les modules métier.
 *
 * Règle : tout module **peut** importer depuis `../common/contracts`,
 * mais **jamais** d'un autre module métier (cf. ADR-001 §3).
 *
 * Voir : docs/adrs/ADR-007 (à venir).
 */
export type { IDomainEvent } from './domain-event.interface';
export type { IModuleRegistration } from './module-registration.interface';
export type {
  IWorkOrderHook,
  WorkOrderHookSnapshot,
  HookContext,
} from './work-order-hook.interface';
export { WORK_ORDER_HOOKS } from './work-order-hook.interface';
