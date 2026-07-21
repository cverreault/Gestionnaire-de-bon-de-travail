import { useEffect, useState, useMemo } from 'react';
import { useWorkOrderAudit } from '../hooks/useAudit';
import { theme } from '../theme';

/**
 * Live timer showing how long the technician has been EN_ROUTE.
 *
 * No schema change: we already persist every statusChanged event to the
 * audit log (B2 + A6). The component:
 *   1. Pulls the timeline via useWorkOrderAudit (TECH allowed by A6).
 *   2. Finds the most recent statusChanged event with toStatusCode = 300
 *      (EN_ROUTE).
 *   3. Renders an elapsed-time chip that ticks every second.
 *
 * Renders nothing while loading, on error, or if no EN_ROUTE event is
 * present yet — the parent decides when to mount this (typically when
 * wo.status === EN_ROUTE).
 */

const EN_ROUTE_STEP_CODE = 300;
const STATUS_CHANGED_EVENT = 'workOrders.workOrder.statusChanged';

interface Props {
  workOrderId: string;
}

function formatElapsed(ms: number): string {
  if (ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function EnRouteTimer({ workOrderId }: Props) {
  const { data: entries = [], isLoading, isError } = useWorkOrderAudit(workOrderId);

  // Most recent EN_ROUTE entry — audit is returned with the newest event first
  // (cf. AuditService.findRecentForAggregate orderBy occurredAt desc).
  const startedAt = useMemo(() => {
    for (const e of entries) {
      if (e.eventName !== STATUS_CHANGED_EVENT) continue;
      const data = e.data as { toStatusCode?: number } | null;
      if (data?.toStatusCode === EN_ROUTE_STEP_CODE) {
        return new Date(e.occurredAt);
      }
    }
    return null;
  }, [entries]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (isLoading || isError || !startedAt) return null;

  const elapsedMs = now - startedAt.getTime();

  return (
    <div
      title={`Départ : ${startedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: '0.4rem 0.75rem',
        borderRadius: theme.radius.full,
        background: theme.colors.warningLight ?? 'var(--c-warningLight)',
        border: `1px solid ${theme.colors.warning ?? '#f59e0b'}`,
        color: theme.colors.warning ?? '#b45309',
        fontSize: theme.font.sizeSm,
        fontWeight: theme.font.weightSemibold,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">🚗</span>
      <span>En route depuis</span>
      <span style={{ fontFamily: 'monospace' }}>{formatElapsed(elapsedMs)}</span>
    </div>
  );
}
