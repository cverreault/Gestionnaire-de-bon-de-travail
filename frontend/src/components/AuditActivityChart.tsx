import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuditActivityStats } from '../hooks/useAudit';
import { theme } from '../theme';

/**
 * Compact admin-dashboard chart : daily audit event counts over the last
 * `days` days plus a top-5 event-type sidebar.
 *
 * Renders inline SVG bars — no chart lib dependency. Width scales to
 * 100 % of the container; bar height ratio is computed from the day with
 * the highest count.
 */

interface Props {
  /** Window in days (default 30). */
  days?: number;
  /** Hide entirely if the audit table is empty — set to false on the
   *  audit page itself where we *do* want to show "0". */
  hideWhenEmpty?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function eventShortName(full: string): string {
  // workOrders.workOrder.assigned → assigned
  const parts = full.split('.');
  return parts[parts.length - 1];
}

export default function AuditActivityChart({ days = 30, hideWhenEmpty = true }: Props) {
  const { data, isLoading, isError } = useAuditActivityStats(days);

  // Build a contiguous range so days with no events render as a 0 bar
  // instead of being skipped — pattern recognition matters more than
  // raw data fidelity on a 30-day overview.
  const series = useMemo(() => {
    if (!data) return [];
    const byDate = new Map(data.perDay.map((r) => [r.date, r.count]));
    const out: Array<{ date: string; count: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY_MS);
      const iso = d.toISOString().slice(0, 10);
      out.push({ date: iso, count: byDate.get(iso) ?? 0 });
    }
    return out;
  }, [data, days]);

  if (isLoading) {
    return (
      <section style={cardStyle}>
        <p style={{ color: theme.colors.textMuted }}>Chargement de l'activité…</p>
      </section>
    );
  }

  if (isError) {
    return (
      <section style={cardStyle}>
        <p style={{ color: theme.colors.danger }}>Impossible de charger l'activité d'audit.</p>
      </section>
    );
  }

  if (!data || (hideWhenEmpty && data.total === 0)) return null;

  const max = Math.max(1, ...series.map((s) => s.count));

  return (
    <section style={cardStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: theme.font.sizeMd, color: theme.colors.text }}>
          📊 Activité d'audit ({data.range.days} derniers jours)
        </h2>
        <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
          {data.total} évènement{data.total === 1 ? '' : 's'}
        </span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
        {/* ── Bar chart ──────────────────────────────────────────────────── */}
        <div style={{ overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${series.length * 10} 100`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: '120px', display: 'block' }}
            role="img"
            aria-label={`Activité d'audit sur ${series.length} jours`}
          >
            {series.map((s, i) => {
              const h = (s.count / max) * 95; // leave 5% for the floor line
              return (
                <rect
                  key={s.date}
                  x={i * 10 + 1}
                  y={100 - h}
                  width={8}
                  height={Math.max(h, s.count > 0 ? 1 : 0)}
                  fill={s.count > 0 ? theme.colors.primary : theme.colors.surfaceAlt}
                >
                  <title>{`${fmtDayLabel(s.date)} — ${s.count} évènement${s.count === 1 ? '' : 's'}`}</title>
                </rect>
              );
            })}
            <line x1="0" y1="100" x2={series.length * 10} y2="100" stroke={theme.colors.border} strokeWidth="0.5" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: theme.colors.textMuted, marginTop: '0.25rem' }}>
            <span>{fmtDayLabel(series[0]?.date ?? '')}</span>
            <span>{fmtDayLabel(series[series.length - 1]?.date ?? '')}</span>
          </div>
        </div>

        {/* ── Top events ────────────────────────────────────────────────── */}
        <div>
          <p style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted, margin: '0 0 0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Top évènements
          </p>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {data.topEvents.slice(0, 5).map((e) => (
              <li key={e.eventName} style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: theme.font.sizeSm,
                fontFamily: 'monospace',
              }}>
                <Link
                  to={`/audit?eventName=${encodeURIComponent(e.eventName)}`}
                  title={e.eventName}
                  style={{
                    color: theme.colors.primary,
                    textDecoration: 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {eventShortName(e.eventName)}
                </Link>
                <span style={{ fontWeight: theme.font.weightSemibold, color: theme.colors.textSecondary, marginLeft: '0.5rem' }}>
                  {e.count}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

const cardStyle = {
  background: theme.colors.surface,
  border: theme.borders.default,
  borderRadius: theme.radius.lg,
  padding: '1.25rem',
  marginBottom: '1.5rem',
};
