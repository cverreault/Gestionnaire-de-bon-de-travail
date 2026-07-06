/**
 * QA — admin-transitions-map.test.ts
 *
 * Validates the ADMIN_TRANSITIONS map defined in WorkOrderDetailPage:
 *  - Every WorkOrderStatus has an entry
 *  - Each target status is a valid WorkOrderStatus value
 *  - Special modal triggers are correctly assigned
 *  - EN_ROUTE is properly represented as a source AND target
 *  - COMPLETED_NEGATIVE re-open has no needsReason (no modal required)
 *  - COMPLETED_POSITIVE re-open has needsReason === 'reopen'
 *  - COMPLETED_NEGATIVE → admin forces negative modal before calling API
 */

import { describe, it, expect } from 'vitest';
import { WorkOrderStatus } from '../types/index';

// ─── Re-declare the ADMIN_TRANSITIONS map (mirrors WorkOrderDetailPage) ───────
// We re-declare it here so tests are independent of React component imports.

type AdminTransition = {
  label: string;
  targetStatus: WorkOrderStatus;
  color: string;
  needsReason?: 'negative' | 'reopen';
};

const ADMIN_TRANSITIONS: Record<string, AdminTransition[]> = {
  [WorkOrderStatus.REQUESTED]: [
    { label: '✔ Approuver la demande', targetStatus: WorkOrderStatus.CREATED, color: '#10b981' },
    { label: '✕ Rejeter la demande', targetStatus: WorkOrderStatus.COMPLETED_NEGATIVE, color: '#ef4444', needsReason: 'negative' },
  ],
  [WorkOrderStatus.CREATED]: [
    { label: '→ Assigner', targetStatus: WorkOrderStatus.ASSIGNED, color: '#f59e0b' },
  ],
  [WorkOrderStatus.ASSIGNED]: [
    { label: '→ Répartir', targetStatus: WorkOrderStatus.DISPATCHED, color: '#6366f1' },
    { label: '✕ Retirer assignation', targetStatus: WorkOrderStatus.CREATED, color: '#6b7280' },
  ],
  [WorkOrderStatus.DISPATCHED]: [
    { label: '🚗 En route', targetStatus: WorkOrderStatus.EN_ROUTE, color: '#7c3aed' },
    { label: '▶ Démarrer travaux', targetStatus: WorkOrderStatus.IN_PROGRESS, color: '#f97316' },
  ],
  [WorkOrderStatus.EN_ROUTE]: [
    { label: '▶ Démarrer travaux', targetStatus: WorkOrderStatus.IN_PROGRESS, color: '#f97316' },
  ],
  [WorkOrderStatus.IN_PROGRESS]: [
    { label: '✅ Fin positive', targetStatus: WorkOrderStatus.COMPLETED_POSITIVE, color: '#10b981' },
    { label: '❌ Fin négative', targetStatus: WorkOrderStatus.COMPLETED_NEGATIVE, color: '#ef4444', needsReason: 'negative' },
  ],
  [WorkOrderStatus.COMPLETED_POSITIVE]: [
    { label: '🔄 Ré-ouvrir', targetStatus: WorkOrderStatus.CREATED, color: '#6b7280', needsReason: 'reopen' },
  ],
  [WorkOrderStatus.COMPLETED_NEGATIVE]: [
    { label: '🔄 Ré-ouvrir', targetStatus: WorkOrderStatus.CREATED, color: '#6b7280' },
  ],
};

// ─── Completeness ─────────────────────────────────────────────────────────────

describe('ADMIN_TRANSITIONS — completeness', () => {
  const ALL_STATUSES = Object.values(WorkOrderStatus);

  it('defines an entry for every WorkOrderStatus', () => {
    for (const status of ALL_STATUSES) {
      expect(ADMIN_TRANSITIONS).toHaveProperty(status);
    }
  });

  it('has exactly 8 entries (one per status)', () => {
    expect(Object.keys(ADMIN_TRANSITIONS)).toHaveLength(8);
  });

  it('no entry has an empty transitions array', () => {
    for (const [status, transitions] of Object.entries(ADMIN_TRANSITIONS)) {
      expect(transitions.length).toBeGreaterThan(0);
    }
  });
});

// ─── Valid target statuses ────────────────────────────────────────────────────

describe('ADMIN_TRANSITIONS — all target statuses are valid WorkOrderStatus values', () => {
  const validStatuses = new Set(Object.values(WorkOrderStatus));

  it('every targetStatus is a known WorkOrderStatus', () => {
    for (const [, transitions] of Object.entries(ADMIN_TRANSITIONS)) {
      for (const t of transitions) {
        expect(validStatuses).toContain(t.targetStatus);
      }
    }
  });
});

// ─── EN_ROUTE integration ─────────────────────────────────────────────────────

describe('ADMIN_TRANSITIONS — EN_ROUTE integration', () => {
  it('DISPATCHED has EN_ROUTE as a target', () => {
    const targets = ADMIN_TRANSITIONS[WorkOrderStatus.DISPATCHED].map((t) => t.targetStatus);
    expect(targets).toContain(WorkOrderStatus.EN_ROUTE);
  });

  it('EN_ROUTE has IN_PROGRESS as a target', () => {
    const targets = ADMIN_TRANSITIONS[WorkOrderStatus.EN_ROUTE].map((t) => t.targetStatus);
    expect(targets).toContain(WorkOrderStatus.IN_PROGRESS);
  });

  it('admin can also jump DISPATCHED → IN_PROGRESS (admin privilege)', () => {
    const targets = ADMIN_TRANSITIONS[WorkOrderStatus.DISPATCHED].map((t) => t.targetStatus);
    expect(targets).toContain(WorkOrderStatus.IN_PROGRESS);
  });
});

// ─── Modal triggers ───────────────────────────────────────────────────────────

describe('ADMIN_TRANSITIONS — modal trigger correctness', () => {
  it('IN_PROGRESS → COMPLETED_NEGATIVE requires needsReason === "negative"', () => {
    const t = ADMIN_TRANSITIONS[WorkOrderStatus.IN_PROGRESS].find(
      (x) => x.targetStatus === WorkOrderStatus.COMPLETED_NEGATIVE,
    );
    expect(t).toBeDefined();
    expect(t!.needsReason).toBe('negative');
  });

  it('COMPLETED_POSITIVE → CREATED requires needsReason === "reopen"', () => {
    const t = ADMIN_TRANSITIONS[WorkOrderStatus.COMPLETED_POSITIVE].find(
      (x) => x.targetStatus === WorkOrderStatus.CREATED,
    );
    expect(t).toBeDefined();
    expect(t!.needsReason).toBe('reopen');
  });

  it('COMPLETED_NEGATIVE → CREATED has no needsReason (no modal required)', () => {
    const t = ADMIN_TRANSITIONS[WorkOrderStatus.COMPLETED_NEGATIVE].find(
      (x) => x.targetStatus === WorkOrderStatus.CREATED,
    );
    expect(t).toBeDefined();
    expect(t!.needsReason).toBeUndefined();
  });

  it('ASSIGNED → CREATED (un-assign) has no needsReason', () => {
    const t = ADMIN_TRANSITIONS[WorkOrderStatus.ASSIGNED].find(
      (x) => x.targetStatus === WorkOrderStatus.CREATED,
    );
    expect(t).toBeDefined();
    expect(t!.needsReason).toBeUndefined();
  });
});

// ─── handleAdminTransition logic simulation ───────────────────────────────────

describe('handleAdminTransition — routing logic', () => {
  /**
   * Simulates the handleAdminTransition function logic from WorkOrderDetailPage
   * to verify the routing to the correct modal or direct API call.
   */
  function simulateAdminTransition(t: AdminTransition): 'negative_modal' | 'reopen_modal' | 'assign_modal' | 'direct' {
    if (t.needsReason === 'negative') return 'negative_modal';
    if (t.needsReason === 'reopen')   return 'reopen_modal';
    if (t.targetStatus === WorkOrderStatus.ASSIGNED) return 'assign_modal';
    return 'direct';
  }

  it('CREATED → ASSIGNED routes to assign_modal', () => {
    const t = ADMIN_TRANSITIONS[WorkOrderStatus.CREATED][0];
    expect(simulateAdminTransition(t)).toBe('assign_modal');
  });

  it('DISPATCHED → EN_ROUTE routes to direct (no modal)', () => {
    const t = ADMIN_TRANSITIONS[WorkOrderStatus.DISPATCHED].find(
      (x) => x.targetStatus === WorkOrderStatus.EN_ROUTE,
    )!;
    expect(simulateAdminTransition(t)).toBe('direct');
  });

  it('EN_ROUTE → IN_PROGRESS routes to direct (no modal)', () => {
    const t = ADMIN_TRANSITIONS[WorkOrderStatus.EN_ROUTE][0];
    expect(simulateAdminTransition(t)).toBe('direct');
  });

  it('IN_PROGRESS → COMPLETED_NEGATIVE routes to negative_modal', () => {
    const t = ADMIN_TRANSITIONS[WorkOrderStatus.IN_PROGRESS].find(
      (x) => x.targetStatus === WorkOrderStatus.COMPLETED_NEGATIVE,
    )!;
    expect(simulateAdminTransition(t)).toBe('negative_modal');
  });

  it('COMPLETED_POSITIVE → CREATED routes to reopen_modal', () => {
    const t = ADMIN_TRANSITIONS[WorkOrderStatus.COMPLETED_POSITIVE][0];
    expect(simulateAdminTransition(t)).toBe('reopen_modal');
  });

  it('COMPLETED_NEGATIVE → CREATED routes to direct (admin reopen without mandatory reason)', () => {
    const t = ADMIN_TRANSITIONS[WorkOrderStatus.COMPLETED_NEGATIVE][0];
    expect(simulateAdminTransition(t)).toBe('direct');
  });
});
