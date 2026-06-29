import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getResolutionTime,
  getCompletionOutcome,
  getSlaSummary,
  getThroughput,
  type ResolutionTimeRow,
  type CompletionOutcomeRow,
  type SlaSummaryRow,
  type ThroughputBucket,
} from '../services/reports.service';
import { cardStyles, layoutStyles, buttonStyles, theme } from '../theme';

/**
 * Reports & KPIs page (B3.5).
 *
 * 4 sections sourced from /api/reports/kpis/*. Date range picker at
 * the top defaults to last 30 days; each KPI re-fetches when the
 * range changes. No charting library — the data is shown as tables
 * with inline progress bars so we don't add 50KB+ of recharts /
 * d3 for a v1.
 */

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return isoDate(d);
}

function defaultTo(): string {
  return isoDate(new Date());
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} j`;
}

function formatPercent(rate: number | null): string {
  if (rate === null) return '—';
  return `${(rate * 100).toFixed(0)} %`;
}

interface BarProps {
  value: number;
  max: number;
  color: string;
}

function Bar({ value, max, color }: BarProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      style={{
        width: '100%',
        height: 8,
        background: theme.colors.surfaceAlt,
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          transition: 'width 200ms',
        }}
      />
    </div>
  );
}

export default function ReportsPage() {
  const { t } = useTranslation('reports');
  const [from, setFrom] = useState<string>(defaultFrom());
  const [to, setTo] = useState<string>(defaultTo());
  const [appliedFrom, setAppliedFrom] = useState<string>(from);
  const [appliedTo, setAppliedTo] = useState<string>(to);

  const params = useMemo(
    () => ({
      from: appliedFrom ? new Date(appliedFrom).toISOString() : undefined,
      to: appliedTo
        ? new Date(`${appliedTo}T23:59:59`).toISOString()
        : undefined,
    }),
    [appliedFrom, appliedTo],
  );

  const resolutionQ = useQuery({
    queryKey: ['reports', 'resolution-time', params],
    queryFn: () => getResolutionTime(params),
  });
  const outcomeQ = useQuery({
    queryKey: ['reports', 'completion-outcome', params],
    queryFn: () => getCompletionOutcome(params),
  });
  const slaQ = useQuery({
    queryKey: ['reports', 'sla', params],
    queryFn: () => getSlaSummary(params),
  });
  const throughputQ = useQuery({
    queryKey: ['reports', 'throughput', params],
    queryFn: () => getThroughput(params),
  });

  const apply = () => {
    setAppliedFrom(from);
    setAppliedTo(to);
  };

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: theme.spacing.lg }}>
        <h1 style={{ margin: 0 }}>{t('title')}</h1>
        <p style={{ color: theme.colors.textMuted, margin: '4px 0 0' }}>
          {t('subtitle')}
        </p>
      </header>

      <section style={{ ...cardStyles.card, marginBottom: theme.spacing.lg }}>
        <div
          style={{
            display: 'flex',
            gap: theme.spacing.md,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: theme.colors.textMuted }}>{t('from')}</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{
                padding: '6px 8px',
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 4,
                background: theme.colors.surface,
                color: theme.colors.text,
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: theme.colors.textMuted }}>{t('to')}</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{
                padding: '6px 8px',
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 4,
                background: theme.colors.surface,
                color: theme.colors.text,
              }}
            />
          </label>
          <button onClick={apply} style={buttonStyles.primary}>
            {t('apply')}
          </button>
        </div>
      </section>

      <ResolutionTimeSection
        rows={resolutionQ.data?.rows}
        loading={resolutionQ.isLoading}
        noData={t('noData')}
        title={t('sections.resolutionTime.title')}
        description={t('sections.resolutionTime.description')}
        columns={t('columns', { returnObjects: true }) as Record<string, string>}
      />

      <CompletionOutcomeSection
        rows={outcomeQ.data?.rows}
        loading={outcomeQ.isLoading}
        noData={t('noData')}
        title={t('sections.completionOutcome.title')}
        description={t('sections.completionOutcome.description')}
        columns={t('columns', { returnObjects: true }) as Record<string, string>}
      />

      <SlaSection
        rows={slaQ.data?.rows}
        loading={slaQ.isLoading}
        noData={t('noData')}
        title={t('sections.sla.title')}
        description={t('sections.sla.description')}
        columns={t('columns', { returnObjects: true }) as Record<string, string>}
      />

      <ThroughputSection
        buckets={throughputQ.data?.buckets}
        loading={throughputQ.isLoading}
        noData={t('noData')}
        title={t('sections.throughput.title')}
        description={t('sections.throughput.description')}
        columns={t('columns', { returnObjects: true }) as Record<string, string>}
      />
    </div>
  );
}

interface SectionShellProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

function SectionShell({ title, description, children }: SectionShellProps) {
  return (
    <section style={{ ...cardStyles.card, marginBottom: theme.spacing.lg }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>{title}</h2>
      <p style={{ margin: '0 0 16px', color: theme.colors.textMuted, fontSize: 13 }}>
        {description}
      </p>
      {children}
    </section>
  );
}

interface SectionProps<Row> {
  rows?: Row[];
  loading: boolean;
  noData: string;
  title: string;
  description: string;
  columns: Record<string, string>;
}

function ResolutionTimeSection(props: SectionProps<ResolutionTimeRow>) {
  const { rows, loading, noData, title, description, columns } = props;
  const max = Math.max(0, ...(rows?.map((r) => r.avgResolutionHours) ?? [0]));
  return (
    <SectionShell title={title} description={description}>
      {loading ? (
        <p>…</p>
      ) : !rows || rows.length === 0 ? (
        <p style={{ color: theme.colors.textMuted }}>{noData}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted }}>{columns.taskType}</th>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted }}>{columns.completed}</th>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted }}>{columns.average}</th>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted }}>{columns.median}</th>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted, width: '30%' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.taskTypeId ?? '_none'} style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                <td style={{ padding: 8 }}>{r.taskTypeName ?? columns.untyped}</td>
                <td style={{ padding: 8 }}>{r.completedCount}</td>
                <td style={{ padding: 8 }}>{formatHours(r.avgResolutionHours)}</td>
                <td style={{ padding: 8 }}>{formatHours(r.medianResolutionHours)}</td>
                <td style={{ padding: 8 }}>
                  <Bar value={r.avgResolutionHours} max={max} color={theme.colors.primary} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionShell>
  );
}

function CompletionOutcomeSection(props: SectionProps<CompletionOutcomeRow>) {
  const { rows, loading, noData, title, description, columns } = props;
  return (
    <SectionShell title={title} description={description}>
      {loading ? (
        <p>…</p>
      ) : !rows || rows.length === 0 ? (
        <p style={{ color: theme.colors.textMuted }}>{noData}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted }}>{columns.taskType}</th>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted }}>{columns.positive}</th>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted }}>{columns.negative}</th>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted }}>{columns.successRate}</th>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted, width: '30%' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.taskTypeId ?? '_none'} style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                <td style={{ padding: 8 }}>{r.taskTypeName ?? columns.untyped}</td>
                <td style={{ padding: 8 }}>{r.positive}</td>
                <td style={{ padding: 8 }}>{r.negative}</td>
                <td style={{ padding: 8, fontWeight: 600 }}>{formatPercent(r.successRate)}</td>
                <td style={{ padding: 8 }}>
                  <Bar
                    value={(r.successRate ?? 0) * 100}
                    max={100}
                    color={(r.successRate ?? 0) >= 0.7 ? '#16a34a' : (r.successRate ?? 0) >= 0.4 ? '#f59e0b' : '#dc2626'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionShell>
  );
}

function SlaSection(props: SectionProps<SlaSummaryRow>) {
  const { rows, loading, noData, title, description, columns } = props;
  return (
    <SectionShell title={title} description={description}>
      {loading ? (
        <p>…</p>
      ) : !rows || rows.length === 0 ? (
        <p style={{ color: theme.colors.textMuted }}>{noData}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted }}>{columns.taskType}</th>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted }}>{columns.tracked}</th>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted }}>{columns.breached}</th>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted }}>{columns.breachRate}</th>
              <th style={{ padding: 8, fontSize: 12, color: theme.colors.textMuted, width: '30%' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.taskTypeId ?? '_none'} style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                <td style={{ padding: 8 }}>{r.taskTypeName ?? columns.untyped}</td>
                <td style={{ padding: 8 }}>{r.tracked}</td>
                <td style={{ padding: 8 }}>{r.breached}</td>
                <td style={{ padding: 8, fontWeight: 600 }}>{formatPercent(r.breachRate)}</td>
                <td style={{ padding: 8 }}>
                  <Bar
                    value={(r.breachRate ?? 0) * 100}
                    max={100}
                    color={(r.breachRate ?? 0) <= 0.1 ? '#16a34a' : (r.breachRate ?? 0) <= 0.3 ? '#f59e0b' : '#dc2626'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionShell>
  );
}

function ThroughputSection(props: { buckets?: ThroughputBucket[]; loading: boolean; noData: string; title: string; description: string; columns: Record<string, string> }) {
  const { buckets, loading, noData, title, description, columns } = props;
  const max = Math.max(0, ...(buckets?.flatMap((b) => [b.created, b.completed]) ?? [0]));
  return (
    <SectionShell title={title} description={description}>
      {loading ? (
        <p>…</p>
      ) : !buckets || buckets.length === 0 ? (
        <p style={{ color: theme.colors.textMuted }}>{noData}</p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 160, overflowX: 'auto', padding: '8px 0' }}>
          {buckets.map((b) => (
            <div
              key={b.date}
              title={`${b.date} — ${columns.created}: ${b.created}, ${columns.completed}: ${b.completed}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 14 }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-end', height: 140, gap: 1 }}>
                <div
                  style={{
                    width: 6,
                    height: max > 0 ? `${(b.created / max) * 140}px` : 0,
                    background: theme.colors.primary,
                    borderRadius: 1,
                  }}
                />
                <div
                  style={{
                    width: 6,
                    height: max > 0 ? `${(b.completed / max) * 140}px` : 0,
                    background: '#16a34a',
                    borderRadius: 1,
                  }}
                />
              </div>
              <div style={{ fontSize: 9, color: theme.colors.textMuted, transform: 'rotate(-45deg)', transformOrigin: 'top left', whiteSpace: 'nowrap' }}>
                {b.date.slice(5)}
              </div>
            </div>
          ))}
        </div>
      )}
      {buckets && buckets.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: theme.colors.textMuted }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, background: theme.colors.primary, borderRadius: 2 }} />
            <span>{columns.created}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, background: '#16a34a', borderRadius: 2 }} />
            <span>{columns.completed}</span>
          </div>
        </div>
      )}
    </SectionShell>
  );
}
