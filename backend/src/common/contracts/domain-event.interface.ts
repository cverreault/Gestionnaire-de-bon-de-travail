import { randomUUID } from 'crypto';
/**
 * Base contract for every domain event published in TaskMgr.
 *
 * Convention de nommage : `{moduleId}.{aggregate}.{verb-past-tense}`
 * Exemples :
 *   - `workOrders.workOrder.created`
 *   - `workOrders.workOrder.assigned`
 *   - `workOrders.workOrder.dispatched`
 *   - `workOrders.workOrder.statusChanged`
 *   - `workOrders.workOrder.completed`
 *
 * Tout module qui publie un event implémente cette interface dans
 * `domain/events/{name}.event.ts`. Tout module qui consomme un event
 * référence l'interface du module publisher (pas son implémentation).
 *
 * Voir : docs/adrs/ADR-001 §3 (Inter-module communication)
 *        docs/adrs/ADR-003 §6 (Events publiés par work-orders)
 */
/** Generic factory for modules without a dedicated event file (attachments, inventory…). */
export function createDomainEvent<TName extends string, TData>(input: {
  name: TName;
  aggregateId: string;
  actorUserId: string | null;
  data: TData;
}): IDomainEvent & { name: TName; data: TData } {
  return {
    name: input.name,
    eventId: randomUUID(),
    aggregateId: input.aggregateId,
    occurredAt: new Date(),
    actorUserId: input.actorUserId,
    data: input.data,
  };
}

export interface IDomainEvent {
  /** Nom canonique de l'event — match exact avec EventEmitter2.emit() */
  readonly name: string;
  /** UUID unique de cet event (pour dédup, audit, replay) */
  readonly eventId: string;
  /** UUID de l'aggregate concerné (ex: workOrderId) */
  readonly aggregateId: string;
  /** Quand l'event s'est produit côté serveur */
  readonly occurredAt: Date;
  /** UUID de l'utilisateur à l'origine (null pour events système) */
  readonly actorUserId: string | null;
}
