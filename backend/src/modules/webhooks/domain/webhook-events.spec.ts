import {
  eventMatchesAny,
  isPublishableEvent,
  validateSubscribedEvents,
} from './webhook-events';

describe('webhook-events', () => {
  describe('eventMatchesAny', () => {
    it('matches exact name', () => {
      expect(
        eventMatchesAny('workOrders.workOrder.created', ['workOrders.workOrder.created']),
      ).toBe(true);
    });

    it('matches trailing wildcard prefix', () => {
      expect(
        eventMatchesAny('workOrders.workOrder.created', ['workOrders.*']),
      ).toBe(true);
      expect(
        eventMatchesAny('workOrders.workOrder.statusChanged', ['workOrders.*']),
      ).toBe(true);
    });

    it('does not match a different prefix', () => {
      expect(
        eventMatchesAny('clients.client.created', ['workOrders.*']),
      ).toBe(false);
    });

    it('matches full wildcard', () => {
      expect(eventMatchesAny('anything.at.all', ['*'])).toBe(true);
    });

    it('does not match a partial-word prefix (workOrder vs workOrders)', () => {
      // "workOrder.*" must not match "workOrders.workOrder.created" — we
      // require a dot boundary so a prefix isn't ambiguous with a longer name.
      expect(
        eventMatchesAny('workOrders.workOrder.created', ['workOrder.*']),
      ).toBe(false);
    });
  });

  describe('isPublishableEvent', () => {
    it('accepts a whitelisted name', () => {
      expect(isPublishableEvent('workOrders.workOrder.created')).toBe(true);
      expect(isPublishableEvent('clients.client.updated')).toBe(true);
    });

    it('rejects an unknown name', () => {
      expect(isPublishableEvent('security.rateLimit.exceeded')).toBe(false);
      expect(isPublishableEvent('audit.entry.recorded')).toBe(false);
    });
  });

  describe('validateSubscribedEvents', () => {
    it('accepts a mix of exact and wildcard patterns', () => {
      const { ok, invalid } = validateSubscribedEvents([
        'workOrders.workOrder.created',
        'clients.*',
        '*',
      ]);
      expect(ok).toBe(true);
      expect(invalid).toEqual([]);
    });

    it('rejects an unknown exact event (typo)', () => {
      const { ok, invalid } = validateSubscribedEvents([
        'workOrders.workOrder.craeted', // typo
      ]);
      expect(ok).toBe(false);
      expect(invalid).toEqual(['workOrders.workOrder.craeted']);
    });

    it('rejects a wildcard prefix that matches nothing', () => {
      const { ok, invalid } = validateSubscribedEvents(['nonexistent.*']);
      expect(ok).toBe(false);
      expect(invalid).toEqual(['nonexistent.*']);
    });

    it('rejects empty array', () => {
      const { ok, invalid } = validateSubscribedEvents([]);
      expect(ok).toBe(false);
      expect(invalid).toEqual(['<empty>']);
    });
  });
});
