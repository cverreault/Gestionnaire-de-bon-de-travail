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

  /**
   * B45 — child mutations of a work order emitted by other modules with
   * `aggregateId = workOrderId`, so the BT timeline shows every action.
   */
  @OnEvent('attachments.**', { async: true, promisify: true })
  async onAttachmentEvent(event: IDomainEvent & { data?: unknown }) {
    await this.auditService.record(event);
  }

  @OnEvent('inventory.workOrderPart.**', { async: true, promisify: true })
  async onWorkOrderPartEvent(event: IDomainEvent & { data?: unknown }) {
    await this.auditService.record(event);
  }

  /**
   * Cross-cutting security events emitted from `common/` (RolesGuard, future
   * JWT/throttler hooks). Same persistence path as the business events so
   * the admin sees everything in one timeline.
   */
  @OnEvent('security.**', { async: true, promisify: true })
  async onSecurityEvent(event: IDomainEvent & { data?: unknown }) {
    await this.auditService.record(event);
  }

  /**
   * Platform-level events (SUPER_ADMIN lifecycle from
   * `tenants/api/super-admin-platform-users.controller.ts`). They carry the
   * DEFAULT tenant id so they show up in the SA audit page.
   */
  @OnEvent('platform.**', { async: true, promisify: true })
  async onPlatformEvent(event: IDomainEvent & { data?: unknown }) {
    await this.auditService.record(event);
  }
}
