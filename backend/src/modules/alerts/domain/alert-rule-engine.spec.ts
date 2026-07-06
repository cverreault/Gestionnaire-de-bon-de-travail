import {
  ALERT_CHANNELS,
  ALERT_PUBLISHABLE_EVENTS,
  isPublishableEvent,
  isValidChannel,
  match,
  type AlertRule,
} from './alert-rule-engine';

// Small helper to build a rule with sensible defaults, so each test only
// overrides the fields it cares about.
function rule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'r1',
    isActive: true,
    eventName: 'workOrders.workOrder.statusChanged',
    processDefinitionId: null,
    fromStatusId: null,
    toStatusId: null,
    taskTypeIds: [],
    templateIds: [],
    clientTypeCodes: [],
    addressTypeCodes: [],
    priorityIn: [],
    ...overrides,
  };
}

describe('alert-rule-engine.match', () => {
  it('returns nothing when there are no rules', () => {
    expect(match({ eventName: 'workOrders.workOrder.created' }, [])).toEqual([]);
  });

  it('matches only rules with the exact same eventName', () => {
    const rules = [
      rule({ id: 'a', eventName: 'workOrders.workOrder.created' }),
      rule({ id: 'b', eventName: 'workOrders.workOrder.statusChanged' }),
    ];
    const hits = match(
      { eventName: 'workOrders.workOrder.created' },
      rules,
    );
    expect(hits.map((h) => h.id)).toEqual(['a']);
  });

  it('skips inactive rules', () => {
    const rules = [
      rule({ id: 'off', isActive: false }),
      rule({ id: 'on', isActive: true }),
    ];
    const hits = match(
      { eventName: 'workOrders.workOrder.statusChanged' },
      rules,
    );
    expect(hits.map((h) => h.id)).toEqual(['on']);
  });

  it('filters by processDefinitionId when set', () => {
    const rules = [
      rule({ id: 'any-proc' }),
      rule({ id: 'proc-1', processDefinitionId: 'p1' }),
      rule({ id: 'proc-2', processDefinitionId: 'p2' }),
    ];
    const hits = match(
      {
        eventName: 'workOrders.workOrder.statusChanged',
        processDefinitionId: 'p1',
      },
      rules,
    );
    expect(hits.map((h) => h.id).sort()).toEqual(['any-proc', 'proc-1']);
  });

  it('filters by fromStatusId + toStatusId when both set', () => {
    const rules = [
      rule({ id: 'to-done', toStatusId: 'S_DONE' }),
      rule({ id: 'from-open', fromStatusId: 'S_OPEN' }),
      rule({
        id: 'open-to-done',
        fromStatusId: 'S_OPEN',
        toStatusId: 'S_DONE',
      }),
    ];
    const hits = match(
      {
        eventName: 'workOrders.workOrder.statusChanged',
        fromStatusId: 'S_OPEN',
        toStatusId: 'S_DONE',
      },
      rules,
    );
    expect(hits.map((h) => h.id).sort()).toEqual([
      'from-open',
      'open-to-done',
      'to-done',
    ]);
  });

  it('taskTypeIds acts as a whitelist when non-empty', () => {
    const rules = [
      rule({ id: 'any' }),
      rule({ id: 'repair', taskTypeIds: ['TT_REPAIR'] }),
      rule({ id: 'install', taskTypeIds: ['TT_INSTALL'] }),
    ];
    const hits = match(
      {
        eventName: 'workOrders.workOrder.statusChanged',
        taskTypeId: 'TT_REPAIR',
      },
      rules,
    );
    expect(hits.map((h) => h.id).sort()).toEqual(['any', 'repair']);
  });

  it('templateIds acts as a whitelist when non-empty', () => {
    const rules = [
      rule({ id: 'any' }),
      rule({ id: 'tmplA', templateIds: ['TMPL_A'] }),
      rule({ id: 'tmplB', templateIds: ['TMPL_B'] }),
    ];
    const hits = match(
      {
        eventName: 'workOrders.workOrder.statusChanged',
        templateId: 'TMPL_A',
      },
      rules,
    );
    expect(hits.map((h) => h.id).sort()).toEqual(['any', 'tmplA']);
  });

  it('clientTypeCodes acts as a whitelist when non-empty', () => {
    const rules = [
      rule({ id: 'any' }),
      rule({ id: 'res', clientTypeCodes: ['RESIDENTIAL'] }),
      rule({ id: 'com', clientTypeCodes: ['COMMERCIAL', 'INDUSTRIAL'] }),
    ];
    const hits = match(
      {
        eventName: 'workOrders.workOrder.statusChanged',
        clientTypeCode: 'RESIDENTIAL',
      },
      rules,
    );
    expect(hits.map((h) => h.id).sort()).toEqual(['any', 'res']);
  });

  it('addressTypeCodes acts as a whitelist when non-empty', () => {
    const rules = [
      rule({ id: 'any' }),
      rule({ id: 'chalet', addressTypeCodes: ['CHALET'] }),
      rule({ id: 'both', addressTypeCodes: ['CHALET', 'RESIDENCE'] }),
    ];
    const hits = match(
      {
        eventName: 'workOrders.workOrder.statusChanged',
        addressTypeCode: 'CHALET',
      },
      rules,
    );
    expect(hits.map((h) => h.id).sort()).toEqual(['any', 'both', 'chalet']);
  });

  it('a rule that filters on template + client type + address type simultaneously', () => {
    const rules = [
      rule({
        id: 'combo',
        templateIds: ['TMPL_A'],
        clientTypeCodes: ['COMMERCIAL'],
        addressTypeCodes: ['CHALET'],
      }),
    ];
    // All three match → hit
    expect(
      match(
        {
          eventName: 'workOrders.workOrder.statusChanged',
          templateId: 'TMPL_A',
          clientTypeCode: 'COMMERCIAL',
          addressTypeCode: 'CHALET',
        },
        rules,
      ).map((r) => r.id),
    ).toEqual(['combo']);
    // One doesn't match → no hit
    expect(
      match(
        {
          eventName: 'workOrders.workOrder.statusChanged',
          templateId: 'TMPL_A',
          clientTypeCode: 'RESIDENTIAL', // ← wrong
          addressTypeCode: 'CHALET',
        },
        rules,
      ),
    ).toEqual([]);
  });

  it('priorityIn acts as a whitelist when non-empty', () => {
    const rules = [
      rule({ id: 'any' }),
      rule({ id: 'high', priorityIn: ['HIGH'] }),
      rule({ id: 'high-med', priorityIn: ['HIGH', 'MEDIUM'] }),
    ];
    const hits = match(
      {
        eventName: 'workOrders.workOrder.statusChanged',
        priority: 'MEDIUM',
      },
      rules,
    );
    expect(hits.map((h) => h.id).sort()).toEqual(['any', 'high-med']);
  });

  it('a rule with a filter set is skipped when the context lacks that field', () => {
    const rules = [rule({ id: 'need-tt', taskTypeIds: ['TT_A'] })];
    const hits = match(
      { eventName: 'workOrders.workOrder.statusChanged' },
      rules,
    );
    expect(hits).toEqual([]);
  });

  it('scoping fields do NOT filter when nullish', () => {
    // A rule with all scopes null is a "match every statusChanged" catch-all.
    const rules = [rule({ id: 'catch-all' })];
    const hits = match(
      {
        eventName: 'workOrders.workOrder.statusChanged',
        processDefinitionId: 'p1',
        fromStatusId: 'S1',
        toStatusId: 'S2',
        taskTypeId: 'TT',
        priority: 'HIGH',
      },
      rules,
    );
    expect(hits.map((h) => h.id)).toEqual(['catch-all']);
  });
});

describe('isPublishableEvent', () => {
  it('accepts every whitelisted event name', () => {
    for (const evt of ALERT_PUBLISHABLE_EVENTS) {
      expect(isPublishableEvent(evt)).toBe(true);
    }
  });

  it('rejects internal-only event names', () => {
    expect(isPublishableEvent('security.rateLimit.exceeded')).toBe(false);
    expect(isPublishableEvent('audit.entry.recorded')).toBe(false);
    expect(isPublishableEvent('nonsense')).toBe(false);
  });
});

describe('isValidChannel', () => {
  it('accepts every declared channel', () => {
    for (const c of ALERT_CHANNELS) {
      expect(isValidChannel(c)).toBe(true);
    }
  });

  it('rejects unknown channels', () => {
    expect(isValidChannel('carrier-pigeon')).toBe(false);
    expect(isValidChannel('')).toBe(false);
  });
});
