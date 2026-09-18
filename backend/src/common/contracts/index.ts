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
export {
  DEFAULT_PROCESS_NAME,
  DEFAULT_PROCESS_STATUSES,
  DEFAULT_PROCESS_TRANSITIONS,
  createDefaultProcess,
  toStatusCreateData,
  toTransitionCreateData,
} from './default-process.contract';
export type { DefaultProcessStatusDef, DefaultProcessTransitionDef } from './default-process.contract';
export { DEVICE_ID_HEADER, extractDeviceId } from './device-context.contract';
export { MOBILE_DEVICE_REGISTERED_EVENT, MOBILE_DEVICE_REVOKED_EVENT } from './mobile-events.contract';
export type { MobileDeviceRegisteredPayload, MobileDeviceRevokedPayload } from './mobile-events.contract';
export {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_REPLAYED_HEADER,
  IDEMPOTENCY_STORE,
  IDEMPOTENT_METADATA_KEY,
  IDEMPOTENCY_KEY_REUSED,
  IDEMPOTENCY_IN_PROGRESS,
} from './idempotency.contract';
export type { IIdempotencyStore, IdempotencyScope, IdempotencyRequest, IdempotencyBegin } from './idempotency.contract';
