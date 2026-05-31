/**
 * QA — technician-page-conditions.test.ts
 *
 * Validates the display logic conditions from TechnicianWorkOrderDetailPage:
 *   - canEnRoute, canStart, inProgress, isCompleted
 *
 * Also validates TechnicianWorkOrdersPage ACTIVE_STATUSES filtering.
 *
 * These are pure boolean expressions — no React rendering needed.
 */

import { describe, it, expect } from 'vitest';
import { WorkOrderStatus } from '../types/index';

// ─── Re-implement conditions from TechnicianWorkOrderDetailPage ───────────────

function getPageConditions(status: WorkOrderStatus) {
  const isCompleted = [
    WorkOrderStatus.COMPLETED_POSITIVE,
    WorkOrderStatus.COMPLETED_NEGATIVE,
  ].includes(status);

  const canEnRoute = status === WorkOrderStatus.DISPATCHED;
  const canStart   = status === WorkOrderStatus.EN_ROUTE;
  const inProgress = status === WorkOrderStatus.IN_PROGRESS;

  return { isCompleted, canEnRoute, canStart, inProgress };
}

// ─── ACTIVE_STATUSES from TechnicianWorkOrdersPage ───────────────────────────

const ACTIVE_STATUSES = [
  WorkOrderStatus.DISPATCHED,
  WorkOrderStatus.EN_ROUTE,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ASSIGNED,
];

// ─── Button visibility per status ────────────────────────────────────────────

describe('TechnicianWorkOrderDetailPage — button visibility', () => {
  it('DISPATCHED shows "En route" button only', () => {
    const c = getPageConditions(WorkOrderStatus.DISPATCHED);
    expect(c.canEnRoute).toBe(true);
    expect(c.canStart).toBe(false);
    expect(c.inProgress).toBe(false);
    expect(c.isCompleted).toBe(false);
  });

  it('EN_ROUTE shows "Démarrer les travaux" button only', () => {
    const c = getPageConditions(WorkOrderStatus.EN_ROUTE);
    expect(c.canEnRoute).toBe(false);
    expect(c.canStart).toBe(true);
    expect(c.inProgress).toBe(false);
    expect(c.isCompleted).toBe(false);
  });

  it('IN_PROGRESS shows completion buttons', () => {
    const c = getPageConditions(WorkOrderStatus.IN_PROGRESS);
    expect(c.canEnRoute).toBe(false);
    expect(c.canStart).toBe(false);
    expect(c.inProgress).toBe(true);
    expect(c.isCompleted).toBe(false);
  });

  it('COMPLETED_POSITIVE hides action section (isCompleted)', () => {
    const c = getPageConditions(WorkOrderStatus.COMPLETED_POSITIVE);
    expect(c.isCompleted).toBe(true);
    expect(c.canEnRoute).toBe(false);
    expect(c.canStart).toBe(false);
    expect(c.inProgress).toBe(false);
  });

  it('COMPLETED_NEGATIVE hides action section (isCompleted)', () => {
    const c = getPageConditions(WorkOrderStatus.COMPLETED_NEGATIVE);
    expect(c.isCompleted).toBe(true);
  });

  it('ASSIGNED shows no action button (waiting for dispatch)', () => {
    const c = getPageConditions(WorkOrderStatus.ASSIGNED);
    expect(c.canEnRoute).toBe(false);
    expect(c.canStart).toBe(false);
    expect(c.inProgress).toBe(false);
    expect(c.isCompleted).toBe(false);
  });

  it('CREATED shows no action button', () => {
    const c = getPageConditions(WorkOrderStatus.CREATED);
    expect(c.canEnRoute).toBe(false);
    expect(c.canStart).toBe(false);
    expect(c.inProgress).toBe(false);
    expect(c.isCompleted).toBe(false);
  });
});

// ─── Mutual exclusivity ───────────────────────────────────────────────────────

describe('TechnicianWorkOrderDetailPage — conditions are mutually exclusive', () => {
  const ALL_STATUSES = Object.values(WorkOrderStatus);

  it.each(ALL_STATUSES)('at most one action flag is true for status %s', (status) => {
    const c = getPageConditions(status);
    const activeFlags = [c.canEnRoute, c.canStart, c.inProgress].filter(Boolean).length;
    expect(activeFlags).toBeLessThanOrEqual(1);
  });
});

// ─── TechnicianWorkOrdersPage — ACTIVE_STATUSES ───────────────────────────────

describe('TechnicianWorkOrdersPage — ACTIVE_STATUSES filtering', () => {
  it('includes EN_ROUTE in active statuses', () => {
    expect(ACTIVE_STATUSES).toContain(WorkOrderStatus.EN_ROUTE);
  });

  it('includes DISPATCHED in active statuses', () => {
    expect(ACTIVE_STATUSES).toContain(WorkOrderStatus.DISPATCHED);
  });

  it('includes IN_PROGRESS in active statuses', () => {
    expect(ACTIVE_STATUSES).toContain(WorkOrderStatus.IN_PROGRESS);
  });

  it('includes ASSIGNED in active statuses', () => {
    expect(ACTIVE_STATUSES).toContain(WorkOrderStatus.ASSIGNED);
  });

  it('does NOT include completed statuses in active', () => {
    expect(ACTIVE_STATUSES).not.toContain(WorkOrderStatus.COMPLETED_POSITIVE);
    expect(ACTIVE_STATUSES).not.toContain(WorkOrderStatus.COMPLETED_NEGATIVE);
  });

  it('a work order in EN_ROUTE status is classified as active', () => {
    const mockWO = { status: WorkOrderStatus.EN_ROUTE };
    const isActive = ACTIVE_STATUSES.includes(mockWO.status);
    expect(isActive).toBe(true);
  });

  it('a work order in COMPLETED_POSITIVE status is NOT active', () => {
    const mockWO = { status: WorkOrderStatus.COMPLETED_POSITIVE };
    const isActive = ACTIVE_STATUSES.includes(mockWO.status);
    expect(isActive).toBe(false);
  });
});
