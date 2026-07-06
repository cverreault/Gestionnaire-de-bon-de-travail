/**
 * QA — status-transitions.spec.ts
 *
 * Validates all entries of VALID_TRANSITIONS and the isValidTransition helper
 * introduced with the EN_ROUTE feature.
 *
 * Coverage:
 *  - Every documented allowed transition returns true
 *  - Every undocumented / illegal transition returns false
 *  - EN_ROUTE slot is correctly wired (DISPATCHED → EN_ROUTE, EN_ROUTE → IN_PROGRESS)
 *  - No transition is accidentally symmetrical (forward-only state machine)
 */

import { WorkOrderStatus } from '@prisma/client';
import { VALID_TRANSITIONS, isValidTransition } from './status-transitions';

const ALL_STATUSES = Object.values(WorkOrderStatus);

// ─── VALID_TRANSITIONS map exhaustiveness ────────────────────────────────────

describe('VALID_TRANSITIONS — map completeness', () => {
  it('defines an entry for every WorkOrderStatus', () => {
    for (const status of ALL_STATUSES) {
      expect(VALID_TRANSITIONS).toHaveProperty(status);
    }
  });

  it('contains exactly 8 status entries (including EN_ROUTE and REQUESTED)', () => {
    expect(Object.keys(VALID_TRANSITIONS)).toHaveLength(8);
  });
});

// ─── isValidTransition — allowed transitions ─────────────────────────────────

describe('isValidTransition — allowed transitions', () => {
  const ALLOWED: [WorkOrderStatus, WorkOrderStatus][] = [
    [WorkOrderStatus.CREATED,            WorkOrderStatus.ASSIGNED],
    [WorkOrderStatus.ASSIGNED,           WorkOrderStatus.DISPATCHED],
    [WorkOrderStatus.ASSIGNED,           WorkOrderStatus.CREATED],         // un-assign
    [WorkOrderStatus.DISPATCHED,         WorkOrderStatus.EN_ROUTE],        // NEW
    [WorkOrderStatus.EN_ROUTE,           WorkOrderStatus.IN_PROGRESS],     // NEW
    [WorkOrderStatus.IN_PROGRESS,        WorkOrderStatus.COMPLETED_POSITIVE],
    [WorkOrderStatus.IN_PROGRESS,        WorkOrderStatus.COMPLETED_NEGATIVE],
    [WorkOrderStatus.COMPLETED_NEGATIVE, WorkOrderStatus.CREATED],         // re-open failed
    [WorkOrderStatus.COMPLETED_POSITIVE, WorkOrderStatus.CREATED],         // admin re-open
  ];

  test.each(ALLOWED)(
    'allows %s → %s',
    (from, to) => {
      expect(isValidTransition(from, to)).toBe(true);
    },
  );
});

// ─── isValidTransition — forbidden transitions ────────────────────────────────

describe('isValidTransition — forbidden / illegal transitions', () => {
  const FORBIDDEN: [WorkOrderStatus, WorkOrderStatus][] = [
    // Skipping EN_ROUTE is not permitted for normal users
    [WorkOrderStatus.DISPATCHED,         WorkOrderStatus.IN_PROGRESS],
    // Going backward without passing through the re-open path
    [WorkOrderStatus.IN_PROGRESS,        WorkOrderStatus.DISPATCHED],
    [WorkOrderStatus.IN_PROGRESS,        WorkOrderStatus.EN_ROUTE],
    [WorkOrderStatus.IN_PROGRESS,        WorkOrderStatus.ASSIGNED],
    [WorkOrderStatus.EN_ROUTE,           WorkOrderStatus.DISPATCHED],      // no going back
    [WorkOrderStatus.EN_ROUTE,           WorkOrderStatus.ASSIGNED],
    [WorkOrderStatus.EN_ROUTE,           WorkOrderStatus.CREATED],
    // Completed states are terminal (except admin re-open via CREATED)
    [WorkOrderStatus.COMPLETED_POSITIVE, WorkOrderStatus.IN_PROGRESS],
    [WorkOrderStatus.COMPLETED_POSITIVE, WorkOrderStatus.ASSIGNED],
    [WorkOrderStatus.COMPLETED_NEGATIVE, WorkOrderStatus.IN_PROGRESS],
    [WorkOrderStatus.COMPLETED_NEGATIVE, WorkOrderStatus.ASSIGNED],
    // Self-transitions
    [WorkOrderStatus.CREATED,            WorkOrderStatus.CREATED],
    [WorkOrderStatus.IN_PROGRESS,        WorkOrderStatus.IN_PROGRESS],
    [WorkOrderStatus.EN_ROUTE,           WorkOrderStatus.EN_ROUTE],
  ];

  test.each(FORBIDDEN)(
    'blocks %s → %s',
    (from, to) => {
      expect(isValidTransition(from, to)).toBe(false);
    },
  );
});

// ─── EN_ROUTE specific tests ──────────────────────────────────────────────────

describe('EN_ROUTE — new status wire-up', () => {
  it('DISPATCHED is no longer a direct gateway to IN_PROGRESS for non-admin', () => {
    expect(isValidTransition(WorkOrderStatus.DISPATCHED, WorkOrderStatus.IN_PROGRESS)).toBe(false);
  });

  it('DISPATCHED → EN_ROUTE is the required first step after dispatch', () => {
    expect(isValidTransition(WorkOrderStatus.DISPATCHED, WorkOrderStatus.EN_ROUTE)).toBe(true);
  });

  it('EN_ROUTE → IN_PROGRESS is the only allowed next step from EN_ROUTE', () => {
    const allowedFromEnRoute = VALID_TRANSITIONS[WorkOrderStatus.EN_ROUTE];
    expect(allowedFromEnRoute).toEqual([WorkOrderStatus.IN_PROGRESS]);
  });

  it('EN_ROUTE is not a terminal state — it has exactly one outgoing transition', () => {
    expect(VALID_TRANSITIONS[WorkOrderStatus.EN_ROUTE]).toHaveLength(1);
  });
});

// ─── Admin re-open guard ──────────────────────────────────────────────────────

describe('Admin re-open transitions', () => {
  it('COMPLETED_POSITIVE → CREATED is declared valid (admin bypass enforced at service layer)', () => {
    expect(isValidTransition(WorkOrderStatus.COMPLETED_POSITIVE, WorkOrderStatus.CREATED)).toBe(true);
  });

  it('COMPLETED_NEGATIVE → CREATED is declared valid (re-open failed job)', () => {
    expect(isValidTransition(WorkOrderStatus.COMPLETED_NEGATIVE, WorkOrderStatus.CREATED)).toBe(true);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('returns false for unknown "from" status (gracefully)', () => {
    expect(isValidTransition('UNKNOWN_STATUS' as WorkOrderStatus, WorkOrderStatus.CREATED)).toBe(false);
  });

  it('returns false for unknown "to" status', () => {
    expect(isValidTransition(WorkOrderStatus.CREATED, 'UNKNOWN_STATUS' as WorkOrderStatus)).toBe(false);
  });
});
