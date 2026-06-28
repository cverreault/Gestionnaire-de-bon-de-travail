import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { IDomainEvent } from '../../../common/contracts/domain-event.interface';
import { NotificationsService } from './notifications.service';

/**
 * First cross-module reactor that is NOT audit. Listens for the events
 * we want to surface to users and translates each into a Notification
 * row.
 *
 * The audit module already records every event for compliance — this
 * listener is purely "what should the human user be told about".
 *
 * Add an `@OnEvent('xxx.yyy.zzz')` here for any new event type that
 * deserves an in-app notification.
 */

interface WorkOrderAssignedData {
  technicianId: string;
  previousTechnicianId: string | null;
}

interface WorkOrderEvent extends IDomainEvent {
  data: WorkOrderAssignedData;
}

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('workOrders.workOrder.assigned', { async: true, promisify: true })
  async onWorkOrderAssigned(event: WorkOrderEvent) {
    try {
      const data = event.data;
      // Notify the new assignee — the previous one was already aware
      // through their own actions (or didn't care).
      await this.notifications.create({
        userId: data.technicianId,
        type: 'workOrder.assigned',
        title: 'Nouveau bon de travail assigné',
        body: 'Un bon de travail vient de vous être assigné. Consultez votre liste pour le voir.',
        aggregateId: event.aggregateId,
        data: {
          workOrderId: event.aggregateId,
          previousTechnicianId: data.previousTechnicianId,
        },
      });
    } catch (err) {
      // Never let a listener failure kill the publisher's flow.
      this.logger.error(
        `Failed to create assigned notification for event ${event.eventId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
