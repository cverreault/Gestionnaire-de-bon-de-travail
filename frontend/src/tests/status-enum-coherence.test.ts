/**
 * QA — status-enum-coherence.test.ts
 *
 * Validates that the frontend WorkOrderStatus enum is coherent with the
 * backend schema values. All 7 statuses (including EN_ROUTE) must be present,
 * correctly spelled, and match the string literals used in the database.
 */

import { describe, it, expect } from 'vitest';
import { WorkOrderStatus } from '../types/index';

describe('WorkOrderStatus enum — completeness', () => {
  const EXPECTED_VALUES = [
    'CREATED',
    'ASSIGNED',
    'DISPATCHED',
    'EN_ROUTE',
    'IN_PROGRESS',
    'COMPLETED_POSITIVE',
    'COMPLETED_NEGATIVE',
  ];

  it('has exactly 7 statuses', () => {
    expect(Object.values(WorkOrderStatus)).toHaveLength(7);
  });

  it.each(EXPECTED_VALUES)('contains status "%s"', (status) => {
    expect(Object.values(WorkOrderStatus)).toContain(status);
  });

  it('EN_ROUTE is correctly spelled and has the right string value', () => {
    expect(WorkOrderStatus.EN_ROUTE).toBe('EN_ROUTE');
  });

  it('enum values are plain strings (match Prisma enum keys)', () => {
    for (const [key, value] of Object.entries(WorkOrderStatus)) {
      expect(value).toBe(key); // e.g. WorkOrderStatus.CREATED === 'CREATED'
    }
  });
});

describe('WorkOrderStatus enum — ordering sanity', () => {
  // Not enforced by TS, but validates the expected workflow order
  const orderedValues = Object.values(WorkOrderStatus);

  it('CREATED comes before ASSIGNED', () => {
    expect(orderedValues.indexOf(WorkOrderStatus.CREATED))
      .toBeLessThan(orderedValues.indexOf(WorkOrderStatus.ASSIGNED));
  });

  it('DISPATCHED comes before EN_ROUTE', () => {
    expect(orderedValues.indexOf(WorkOrderStatus.DISPATCHED))
      .toBeLessThan(orderedValues.indexOf(WorkOrderStatus.EN_ROUTE));
  });

  it('EN_ROUTE comes before IN_PROGRESS', () => {
    expect(orderedValues.indexOf(WorkOrderStatus.EN_ROUTE))
      .toBeLessThan(orderedValues.indexOf(WorkOrderStatus.IN_PROGRESS));
  });
});
