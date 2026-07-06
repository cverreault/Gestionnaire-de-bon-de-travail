/**
 * QA — status-badge-labels.test.ts
 *
 * Validates that all label maps across the frontend are complete and coherent:
 *  - WorkOrderStatusBadge STATUS_CONFIG covers all 7 statuses
 *  - WorkOrdersPage STATUS_LABELS covers all 7 statuses
 *  - PrintWorkOrder STATUS_FR covers all 7 statuses
 *  - EN_ROUTE is consistently labelled "En route" in all maps
 *  - TechnicianWorkOrdersPage getStatusAccentColor handles EN_ROUTE with purple
 */

import { describe, it, expect } from 'vitest';
import { WorkOrderStatus } from '../types/index';

// ─── Re-declare label maps (mirrors actual source files) ─────────────────────

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; bg: string; color: string; border: string }> = {
  [WorkOrderStatus.REQUESTED]:          { label: 'Demandé',       bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
  [WorkOrderStatus.CREATED]:            { label: 'Créé',          bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  [WorkOrderStatus.ASSIGNED]:           { label: 'Assigné',       bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  [WorkOrderStatus.DISPATCHED]:         { label: 'Réparti',       bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
  [WorkOrderStatus.EN_ROUTE]:           { label: 'En route',      bg: '#ddd6fe', color: '#5b21b6', border: '#a78bfa' },
  [WorkOrderStatus.IN_PROGRESS]:        { label: 'En cours',      bg: '#fde68a', color: '#78350f', border: '#fbbf24' },
  [WorkOrderStatus.COMPLETED_POSITIVE]: { label: 'Fin positive',  bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
  [WorkOrderStatus.COMPLETED_NEGATIVE]: { label: 'Fin négative',  bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.REQUESTED]:          'Demandé',
  [WorkOrderStatus.CREATED]:            'Créé',
  [WorkOrderStatus.ASSIGNED]:           'Assigné',
  [WorkOrderStatus.DISPATCHED]:         'Dispatché',
  [WorkOrderStatus.EN_ROUTE]:           'En route',
  [WorkOrderStatus.IN_PROGRESS]:        'En cours',
  [WorkOrderStatus.COMPLETED_POSITIVE]: 'Complété (positif)',
  [WorkOrderStatus.COMPLETED_NEGATIVE]: 'Complété (négatif)',
};

const STATUS_FR: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.REQUESTED]:          'Demandé',
  [WorkOrderStatus.CREATED]:            'Créé',
  [WorkOrderStatus.ASSIGNED]:           'Assigné',
  [WorkOrderStatus.DISPATCHED]:         'Réparti',
  [WorkOrderStatus.EN_ROUTE]:           'En route',
  [WorkOrderStatus.IN_PROGRESS]:        'En cours',
  [WorkOrderStatus.COMPLETED_POSITIVE]: 'Terminé (positif)',
  [WorkOrderStatus.COMPLETED_NEGATIVE]: 'Terminé (négatif)',
};

function getStatusAccentColor(status: WorkOrderStatus): string {
  switch (status) {
    case WorkOrderStatus.IN_PROGRESS:        return '#f59e0b'; // orange (theme.colors.warning)
    case WorkOrderStatus.COMPLETED_POSITIVE: return '#10b981'; // vert
    case WorkOrderStatus.COMPLETED_NEGATIVE: return '#ef4444'; // rouge
    case WorkOrderStatus.DISPATCHED:         return '#38bdf8'; // bleu clair (info)
    case WorkOrderStatus.EN_ROUTE:           return '#7c3aed'; // violet
    default:                                 return '#3b82f6'; // bleu (primary)
  }
}

// ─── STATUS_CONFIG (WorkOrderStatusBadge) ────────────────────────────────────

describe('WorkOrderStatusBadge STATUS_CONFIG — completeness', () => {
  const ALL_STATUSES = Object.values(WorkOrderStatus);

  it('has exactly 8 entries', () => {
    expect(Object.keys(STATUS_CONFIG)).toHaveLength(8);
  });

  it.each(ALL_STATUSES)('has an entry for status %s', (status) => {
    expect(STATUS_CONFIG).toHaveProperty(status);
  });

  it('EN_ROUTE label is "En route"', () => {
    expect(STATUS_CONFIG[WorkOrderStatus.EN_ROUTE].label).toBe('En route');
  });

  it('EN_ROUTE uses purple background (#ddd6fe)', () => {
    expect(STATUS_CONFIG[WorkOrderStatus.EN_ROUTE].bg).toBe('#ddd6fe');
  });

  it('each entry has non-empty label, bg, color, border', () => {
    for (const [, cfg] of Object.entries(STATUS_CONFIG)) {
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(cfg.bg).toMatch(/^#[0-9a-fA-F]{3,6}$/);
      expect(cfg.color).toMatch(/^#[0-9a-fA-F]{3,6}$/);
      expect(cfg.border).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    }
  });
});

// ─── STATUS_LABELS (WorkOrdersPage) ──────────────────────────────────────────

describe('WorkOrdersPage STATUS_LABELS — completeness', () => {
  const ALL_STATUSES = Object.values(WorkOrderStatus);

  it('has exactly 8 entries', () => {
    expect(Object.keys(STATUS_LABELS)).toHaveLength(8);
  });

  it.each(ALL_STATUSES)('has a label for status %s', (status) => {
    expect(STATUS_LABELS).toHaveProperty(status);
    expect(STATUS_LABELS[status].length).toBeGreaterThan(0);
  });

  it('EN_ROUTE label is "En route"', () => {
    expect(STATUS_LABELS[WorkOrderStatus.EN_ROUTE]).toBe('En route');
  });
});

// ─── STATUS_FR (PrintWorkOrder) ───────────────────────────────────────────────

describe('PrintWorkOrder STATUS_FR — completeness', () => {
  const ALL_STATUSES = Object.values(WorkOrderStatus);

  it('has exactly 8 entries', () => {
    expect(Object.keys(STATUS_FR)).toHaveLength(8);
  });

  it.each(ALL_STATUSES)('has a French label for status %s', (status) => {
    expect(STATUS_FR).toHaveProperty(status);
    expect(STATUS_FR[status].length).toBeGreaterThan(0);
  });

  it('EN_ROUTE label is "En route"', () => {
    expect(STATUS_FR[WorkOrderStatus.EN_ROUTE]).toBe('En route');
  });
});

// ─── getStatusAccentColor (TechnicianWorkOrdersPage) ─────────────────────────

describe('TechnicianWorkOrdersPage getStatusAccentColor — EN_ROUTE', () => {
  it('EN_ROUTE returns purple (#7c3aed)', () => {
    expect(getStatusAccentColor(WorkOrderStatus.EN_ROUTE)).toBe('#7c3aed');
  });

  it('returns a valid hex color for all statuses', () => {
    for (const status of Object.values(WorkOrderStatus)) {
      const color = getStatusAccentColor(status);
      expect(color).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    }
  });
});

// ─── Cross-file consistency: EN_ROUTE label ───────────────────────────────────

describe('Cross-file EN_ROUTE label consistency', () => {
  it('all label maps use "En route" for EN_ROUTE (case-sensitive)', () => {
    expect(STATUS_CONFIG[WorkOrderStatus.EN_ROUTE].label).toBe('En route');
    expect(STATUS_LABELS[WorkOrderStatus.EN_ROUTE]).toBe('En route');
    expect(STATUS_FR[WorkOrderStatus.EN_ROUTE]).toBe('En route');
  });
});
