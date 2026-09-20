import { describe, expect, it } from 'vitest';
import { periodRange, shiftPeriod, periodLabel } from '../utils/periodRange';

describe('periodRange', () => {
  const anchor = new Date(2026, 8, 19, 12); // Saturday 2026-09-19
  it('computes day, ISO week (Monday–Sunday) and month bounds', () => {
    expect(periodRange('day', anchor)).toEqual({ from: '2026-09-19', to: '2026-09-19' });
    expect(periodRange('week', anchor)).toEqual({ from: '2026-09-14', to: '2026-09-20' });
    expect(periodRange('month', anchor)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodRange('all', anchor)).toEqual({});
  });
  it('shifts by the scope unit', () => {
    expect(periodRange('day', shiftPeriod('day', anchor, 1)).from).toBe('2026-09-20');
    expect(periodRange('week', shiftPeriod('week', anchor, -1)).from).toBe('2026-09-07');
    expect(periodRange('month', shiftPeriod('month', anchor, 1)).from).toBe('2026-10-01');
    expect(shiftPeriod('all', anchor, 1)).toBe(anchor);
  });
  it('labels the period', () => {
    expect(periodLabel('month', anchor, 'fr-CA')).toMatch(/septembre 2026/);
    expect(periodLabel('week', anchor, 'en-CA')).toMatch(/14/);
    expect(periodLabel('all', anchor, 'fr-CA')).toBe('');
  });
});
