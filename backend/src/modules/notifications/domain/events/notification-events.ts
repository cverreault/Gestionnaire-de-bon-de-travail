import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../../common/contracts/domain-event.interface';

/**
 * Events published by the notifications module.
 *
 * For now: just `notifications.notification.sent` so a future module
 * (audit, dashboard, analytics) can count delivery without touching
 * the notifications table directly.
 */

export const NOTIFICATION_EVENT_NAMES = {
  SENT: 'notifications.notification.sent',
} as const;

export type NotificationEventName = typeof NOTIFICATION_EVENT_NAMES[keyof typeof NOTIFICATION_EVENT_NAMES];

export interface NotificationSentData {
  /** Recipient user. */
  userId: string;
  /** Categorical type — same as the row's `type` column. */
  type: string;
  /** Channels that successfully delivered (subset of channelsRequested). */
  channels: string[];
}

export type NotificationSentEvent = IDomainEvent & {
  name: typeof NOTIFICATION_EVENT_NAMES.SENT;
  data: NotificationSentData;
};

export function notificationSent(
  notificationId: string,
  data: NotificationSentData,
): NotificationSentEvent {
  return {
    name: NOTIFICATION_EVENT_NAMES.SENT,
    eventId: randomUUID(),
    aggregateId: notificationId,
    occurredAt: new Date(),
    actorUserId: null,
    data,
  };
}
