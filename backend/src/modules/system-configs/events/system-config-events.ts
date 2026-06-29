import { randomUUID } from 'crypto';
import type { IDomainEvent } from '../../../common/contracts/domain-event.interface';

/**
 * Emitted whenever a config key is upserted or deleted via the
 * SuperAdmin API. Consumers (PushChannelService, future ones) listen to
 * refresh their cached state.
 */

export const SYSTEM_CONFIG_EVENTS = {
  CHANGED: 'systemConfigs.config.changed',
} as const;

export interface SystemConfigChangedData {
  key: string;
}

export type SystemConfigChangedEvent = IDomainEvent & {
  name: typeof SYSTEM_CONFIG_EVENTS.CHANGED;
  data: SystemConfigChangedData;
};

export function systemConfigChanged(
  key: string,
  actorUserId: string | null,
): SystemConfigChangedEvent {
  return {
    name: SYSTEM_CONFIG_EVENTS.CHANGED,
    eventId: randomUUID(),
    aggregateId: key,
    occurredAt: new Date(),
    actorUserId,
    data: { key },
  };
}
