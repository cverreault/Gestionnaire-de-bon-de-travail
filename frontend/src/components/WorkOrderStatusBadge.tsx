import { WorkOrderStatus } from '../types';
import { badgeStyles } from '../theme';

// ─── Legacy static map ────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; bg: string; color: string; border: string }> = {
  [WorkOrderStatus.REQUESTED]:          { label: 'Demandé',       bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
  [WorkOrderStatus.CREATED]:            { label: 'Créé',          bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  [WorkOrderStatus.ASSIGNED]:           { label: 'Assigné',       bg: 'var(--c-warningLight)', color: 'var(--c-warningBadgeText)', border: 'var(--c-warningBadgeBorder)' },
  [WorkOrderStatus.DISPATCHED]:         { label: 'Réparti',       bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
  [WorkOrderStatus.EN_ROUTE]:           { label: 'En route',      bg: '#ddd6fe', color: '#5b21b6', border: '#a78bfa' },
  [WorkOrderStatus.IN_PROGRESS]:        { label: 'En cours',      bg: '#fde68a', color: '#78350f', border: '#fbbf24' },
  [WorkOrderStatus.COMPLETED_POSITIVE]: { label: 'Fin positive',  bg: 'var(--c-successLight)', color: 'var(--c-successBadgeText)', border: 'var(--c-successBadgeBorder)' },
  [WorkOrderStatus.COMPLETED_NEGATIVE]: { label: 'Fin négative',  bg: 'var(--c-dangerLight)', color: 'var(--c-dangerBadgeText)', border: 'var(--c-dangerBadgeBorder)' },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Dynamic step from process engine (preferred when available). */
  step?: { name: string; color: string } | null;
  /** Legacy fallback — used when `step` is not provided. */
  status?: WorkOrderStatus;
  size?: 'sm' | 'md';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkOrderStatusBadge({ step, status, size = 'md' }: Props) {
  const fontSize = size === 'sm' ? '0.7rem' : '0.8rem';
  const padding  = size === 'sm' ? '0.125rem 0.5rem' : '0.25rem 0.75rem';

  // ── Dynamic mode — use process engine step ────────────────────────────────
  if (step) {
    const color       = step.color || '#64748b';
    // 10 % opacity background (hex alpha suffix)
    const bgColor     = color + '1A';
    const borderColor = color + '33';

    return (
      <span
        style={{
          ...badgeStyles.base,
          backgroundColor: bgColor,
          color: color,
          border: `1px solid ${borderColor}`,
          fontSize,
          padding,
        }}
      >
        {step.name}
      </span>
    );
  }

  // ── Legacy mode — use static status map ──────────────────────────────────
  const config = status
    ? (STATUS_CONFIG[status] ?? { label: status, bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' })
    : { label: '—', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' };

  return (
    <span
      style={{
        ...badgeStyles.base,
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        fontSize,
        padding,
      }}
    >
      {config.label}
    </span>
  );
}

