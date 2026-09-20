import { describe, expect, it } from 'vitest';
import { countByTechnician, groupByTechnician, sortDispatchRows } from '../utils/dispatchBoard';
import type { WorkOrder } from '../types';

const wo = (id: string, p: Partial<WorkOrder> = {}): WorkOrder =>
  ({ id, referenceNumber: `AS-${id}`, title: id, priority: 0, type: 'OTHER', status: 'ASSIGNED', assignedToId: null, ...p } as unknown as WorkOrder);

describe('sortDispatchRows', () => {
  const rows = [
    wo('b', { scheduledStartTime: '2026-09-19T14:00:00Z', priority: 1, taskType: { name: 'Réparation' } as never }),
    wo('a', { scheduledStartTime: '2026-09-19T08:00:00Z', priority: 3, taskType: { name: 'Installation' } as never }),
    wo('c', { scheduledDate: '2026-09-20', priority: 3, type: 'REPAIR' as never }),
    wo('d', { priority: 0 }),
  ];
  it('by time puts scheduled first (start time before date-only), unscheduled last', () => {
    expect(sortDispatchRows(rows, 'time').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('by priority descending, then time', () => {
    expect(sortDispatchRows(rows, 'priority').map((r) => r.id)).toEqual(['a', 'c', 'b', 'd']);
  });
  it('by task type name then reference, falling back to the legacy type', () => {
    expect(sortDispatchRows(rows, 'type').map((r) => r.id)).toEqual(['a', 'd', 'c', 'b']);
  });
  it('by reference and never mutates the input', () => {
    const copy = [...rows];
    expect(sortDispatchRows(rows, 'reference').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows).toEqual(copy);
  });
});

describe('groupByTechnician / countByTechnician', () => {
  const rows = [wo('1', { assignedToId: 't1' }), wo('2'), wo('3', { assignedToId: 't1' }), wo('4', { assignedToId: 't2' })];
  it('buckets by technician and keeps unassigned apart', () => {
    const g = groupByTechnician(rows);
    expect(g.unassigned.map((r) => r.id)).toEqual(['2']);
    expect([...g.byTech.keys()]).toEqual(['t1', 't2']);
    expect(g.byTech.get('t1')?.map((r) => r.id)).toEqual(['1', '3']);
  });
  it('counts per technician for the panel badges', () => {
    expect(countByTechnician(rows)).toEqual({ counts: { t1: 2, t2: 1 }, unassigned: 1 });
  });
});
