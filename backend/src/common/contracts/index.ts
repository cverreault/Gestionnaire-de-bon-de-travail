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
export { GEOCODER, propertyFactsToAddressColumns, ADDRESS_GEO_RESET } from './geocoder.contract';
export type { IGeocoder, GeocodeInput, GeocodeResult, GeocodeSource, PropertyFacts, PropertyLookupInput } from './geocoder.contract';
export { GEO_ROLL_IMPORTED_EVENT } from './geo-events.contract';
export type { GeoRollImportedPayload } from './geo-events.contract';
