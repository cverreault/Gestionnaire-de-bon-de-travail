import type { WorkOrder } from '../types';
import { WorkOrderStatus } from '../types';
import { theme } from '../theme';

/**
 * SLA badge (B4.d).
 *
 * Three visual states:
 *   - Breached     : slaBreachedAt is set → red "⚠ Retard" pill
 *   - Imminent     : slaTargetAt is in the next 60 min and not yet
 *                    breached, BT still active → orange "🕒 Bientôt"
 *   - At-risk      : slaTargetAt set, > 1 h away, BT active → grey
 *                    target time tooltip-only (no badge in dense UIs)
 *   - None         : no slaTargetAt, BT completed, or healthy
 *
 * Used in three places:
 *   - WorkOrdersPage table row
 *   - WorkOrderDetailPage header
 *   - TechnicianWorkOrdersPage card
 *
 * `compact` halves the padding for table rows; default is the chip
 * size used on detail pages.
 */

interface Props {
  wo: Pick<WorkOrder, 'slaTargetAt' | 'slaBreachedAt' | 'status'>;
  compact?: boolean;
}

const IMMINENT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isCompleted(status: string): boolean {
  return (
    status === WorkOrderStatus.COMPLETED_POSITIVE ||
    status === WorkOrderStatus.COMPLETED_NEGATIVE
  );
}

function fmtTarget(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function SlaBadge({ wo, compact = false }: Props) {
  if (!wo.slaTargetAt) return null;

  // ── Breached ───────────────────────────────────────────────────────────────
  if (wo.slaBreachedAt) {
    return (
      <span
        title={`SLA dépassé le ${fmtTarget(wo.slaTargetAt)}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: compact ? '0.1rem 0.4rem' : '0.2rem 0.55rem',
          borderRadius: theme.radius.full,
          background: theme.colors.danger ?? '#dc2626',
          color: '#fff',
          fontSize: compact ? '0.65rem' : theme.font.sizeXs,
          fontWeight: theme.font.weightSemibold,
          whiteSpace: 'nowrap',
        }}
      >
        ⚠ Retard
      </span>
    );
  }

  // ── Completed: nothing to flag ─────────────────────────────────────────────
  if (isCompleted(wo.status)) return null;

  const targetMs = new Date(wo.slaTargetAt).getTime();
  const now = Date.now();
  const remainingMs = targetMs - now;

  // ── Imminent (< 1h) ────────────────────────────────────────────────────────
  if (remainingMs > 0 && remainingMs <= IMMINENT_WINDOW_MS) {
    const minutes = Math.max(0, Math.round(remainingMs / 60_000));
    return (
      <span
        title={`Limite SLA : ${fmtTarget(wo.slaTargetAt)}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: compact ? '0.1rem 0.4rem' : '0.2rem 0.55rem',
          borderRadius: theme.radius.full,
          background: theme.colors.warningLight ?? '#fef3c7',
          color: theme.colors.warning ?? '#b45309',
          border: `1px solid ${theme.colors.warning ?? '#f59e0b'}`,
          fontSize: compact ? '0.65rem' : theme.font.sizeXs,
          fontWeight: theme.font.weightSemibold,
          whiteSpace: 'nowrap',
        }}
      >
        🕒 {minutes} min
      </span>
    );
  }

  // ── Past target but breach flag not yet set by cron ────────────────────────
  // Same visual as Breached — the cron runs every 15 min so there's a small
  // window where the badge is more accurate than the persisted flag.
  if (remainingMs <= 0) {
    return (
      <span
        title={`SLA dépassé le ${fmtTarget(wo.slaTargetAt)} — détection en cours`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: compact ? '0.1rem 0.4rem' : '0.2rem 0.55rem',
          borderRadius: theme.radius.full,
          background: theme.colors.danger ?? '#dc2626',
          color: '#fff',
          fontSize: compact ? '0.65rem' : theme.font.sizeXs,
          fontWeight: theme.font.weightSemibold,
          whiteSpace: 'nowrap',
        }}
      >
        ⚠ Retard
      </span>
    );
  }

  return null;
}
