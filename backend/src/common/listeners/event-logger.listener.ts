import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { IDomainEvent } from '../contracts/domain-event.interface';

/**
 * Listener démo qui logue chaque domain event publié.
 *
 * Sert deux objectifs :
 *  1. Valider end-to-end que la chaîne emit → listen fonctionne (smoke test).
 *  2. Donner un audit trail console-only avant qu'un vrai module `audit` (B2)
 *     ne soit branché et persiste les events en DB.
 *
 * Quand le module `audit` arrivera, ce listener pourra être retiré (le module
 * audit consommera les mêmes events de façon plus durable).
 */
@Injectable()
export class EventLoggerListener {
  private readonly logger = new Logger('DomainEvent');

  @OnEvent('workOrders.**', { async: false, promisify: false })
  onWorkOrderEvent(event: IDomainEvent & { data?: unknown }) {
    this.logger.log(
      `[${event.name}] aggregate=${event.aggregateId} ` +
        `actor=${event.actorUserId ?? 'system'} ` +
        `eventId=${event.eventId} ` +
        `data=${JSON.stringify(event.data ?? {})}`,
    );
  }
}
