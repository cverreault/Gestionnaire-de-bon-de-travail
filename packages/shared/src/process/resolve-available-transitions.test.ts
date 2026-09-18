import { resolveAvailableTransitions, transitionLabel } from './resolve-available-transitions';
import type { ProcessSnapshot } from '../contracts/sync';

const snap: ProcessSnapshot = {
  id: 'p', name: 'Standard BT', version: 1, updatedAt: '2026-09-18T00:00:00Z', statuses: [],
  transitions: [
    { id: 't1', fromStatusId: 's200', toStatusId: 's300', label: 'Partir en route', labelEn: 'Depart', allowedRoles: ['ADMIN', 'DISPATCHER', 'TECHNICIAN'], requiredFields: [], sortOrder: 0 },
    { id: 't2', fromStatusId: 's200', toStatusId: 's100', label: 'Annuler dispatch', allowedRoles: ['ADMIN', 'DISPATCHER'], requiredFields: [], sortOrder: 1 },
    { id: 't3', fromStatusId: 's400', toStatusId: 's600', label: 'Terminer (échec)', allowedRoles: ['TECHNICIAN'], requiredFields: ['negativeReason'], sortOrder: 1 },
    { id: 't4', fromStatusId: 's400', toStatusId: 's500', label: 'Terminer (succès)', allowedRoles: ['TECHNICIAN'], requiredFields: ['completionNotes'], sortOrder: 0 },
  ],
};

describe('resolveAvailableTransitions (ADR-016 §7)', () => {
  it('filters by current step and role, sorted by sortOrder', () => {
    expect(resolveAvailableTransitions(snap, 's200', 'TECHNICIAN').map((t) => t.id)).toEqual(['t1']);
    expect(resolveAvailableTransitions(snap, 's200', 'DISPATCHER').map((t) => t.id)).toEqual(['t1', 't2']);
    expect(resolveAvailableTransitions(snap, 's400', 'TECHNICIAN').map((t) => t.id)).toEqual(['t4', 't3']);
  });

  it('is empty without a snapshot or a current step', () => {
    expect(resolveAvailableTransitions(null, 's200', 'TECHNICIAN')).toEqual([]);
    expect(resolveAvailableTransitions(snap, null, 'TECHNICIAN')).toEqual([]);
    expect(resolveAvailableTransitions(snap, 's999', 'TECHNICIAN')).toEqual([]);
  });

  it('labels fall back to the legacy label', () => {
    expect(transitionLabel(snap.transitions[0], 'en')).toBe('Depart');
    expect(transitionLabel(snap.transitions[0], 'fr')).toBe('Partir en route');
    expect(transitionLabel(snap.transitions[1], 'en')).toBe('Annuler dispatch');
  });
});
