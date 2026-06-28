import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { IDomainEvent } from '../../../common/contracts';
import { AuditService } from './services/audit.service';

/**
 * Capture TOUS les domain events publiés sous `workOrders.**` et délègue
 * la persistance au `AuditService`.
 *
 * Ajouter d'autres modules : ajouter un `@OnEvent('moduleX.**')` ici (ou
 * mieux : un listener dédié par module dans `audit/application/listeners/`).
 *
 * Les events sont traités **async** côté pino-emitter mais persistés
 * de façon synchrone côté DB. Les erreurs sont swallowed par
 * AuditService.record() pour ne jamais bloquer le flux métier.
 */
@Injectable()
export class AuditListener {
  private readonly logger = new Logger(AuditListener.name);

  constructor(private readonly auditService: AuditService) {}

  @OnEvent('workOrders.**', { async: true, promisify: true })
  async onWorkOrderEvent(event: IDomainEvent & { data?: unknown }) {
    await this.auditService.record(event);
  }
}
