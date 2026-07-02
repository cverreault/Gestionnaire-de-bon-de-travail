import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { theme, cardStyles, layoutStyles } from '../theme';
import {
  getStats,
  getPerTenantUsage,
  getPlanCatalog,
  type SuperAdminStats,
  type TenantUsageRow,
  type PlanDefinition,
} from '../services/super-admin.service';

/**
 * SA dashboard (B7.7 redesign).
 *
 * Layout :
 *   1. Top row : 4 global KPI cards (tenants / users / BTs / storage)
 *   2. Below : per-tenant usage table with progress bars on every quota
 *      and live signals (sessions, last login, last BT)
 *
 * Refreshes every 30 s in foreground only. Per-tenant query and global
 * stats query run in parallel, each independently failing-soft so a
 * slow per-tenant scan can't blank the global header.
 */
export default function SuperAdminStatsPage() {
  const stats = useQuery({
    queryKey: ['superAdmin', 'stats'],
    queryFn: getStats,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const usage = useQuery({
    queryKey: ['superAdmin', 'stats', 'tenants'],
    queryFn: getPerTenantUsage,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const plans = useQuery({
    queryKey: ['superAdmin', 'plans'],
    queryFn: getPlanCatalog,
    staleTime: 5 * 60_000,
  });

  // Per-tenant MRR (base + perUser × active users) → also aggregated as a
  // platform-wide KPI card. Computed client-side because both inputs are
  // already on this page and the calculation is trivial.
  const planByCode = new Map<string, PlanDefinition>();
  plans.data?.data.forEach((p) => planByCode.set(p.code, p));
  const totalMrr =
    usage.data?.data.reduce(
      (sum, t) => sum + monthlyCharge(t, planByCode.get(t.plan)),
      0,
    ) ?? 0;
  const currency = plans.data?.data[0]?.currency ?? 'CAD';
  const { t } = useTranslation('superAdmin');

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>{t('dashboard.title')}</h1>
        <p style={{ color: theme.colors.textMuted, margin: '4px 0 0' }}>
          {t('dashboard.subtitle')}
        </p>
      </header>

      {/* ── Global KPIs ───────────────────────────────────────────── */}
      {stats.data && (
        <GlobalCards
          data={stats.data}
          mrr={totalMrr}
          currency={currency}
        />
      )}
      {stats.isLoading && !stats.data && <Placeholder text={t('dashboard.loadingStats')} />}

      {/* ── Per-tenant usage ──────────────────────────────────────── */}
      <section style={{ marginTop: 24 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>
          {t('dashboard.usageSection')}
          {usage.data && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 12,
                color: theme.colors.textMuted,
                fontWeight: 400,
              }}
            >
              ({usage.data.data.length})
            </span>
          )}
        </h2>
        {usage.isLoading && !usage.data && (
          <Placeholder text={t('dashboard.loadingUsage')} />
        )}
        {usage.error && (
          <Placeholder text={t('dashboard.usageLoadFailed')} error />
        )}
        {usage.data && (
          <TenantUsageTable rows={usage.data.data} plans={planByCode} />
        )}
      </section>
    </div>
  );
}

// ─── Top KPI cards ─────────────────────────────────────────────────

function GlobalCards({
  data,
  mrr,
  currency,
}: {
  data: SuperAdminStats;
  mrr: number;
  currency: string;
}) {
  const { t, i18n } = useTranslation('superAdmin');
  const numberLocale = i18n.language === 'en' ? 'en-CA' : 'fr-CA';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
      }}
    >
      <KpiCard
        icon="💰"
        label={t('dashboard.kpi.mrr')}
        primary={`${mrr.toLocaleString(numberLocale)} ${currency}`}
        secondary={t('dashboard.kpi.mrrHint')}
        accent={theme.colors.success}
      />
      <KpiCard
        icon="🌍"
        label={t('dashboard.kpi.tenants')}
        primary={`${data.tenants.active} / ${data.tenants.total}`}
        secondary={t('dashboard.kpi.tenantsHint', { count: data.tenants.newThisMonth })}
        accent={theme.colors.primary}
      />
      <KpiCard
        icon="👥"
        label={t('dashboard.kpi.activeUsers')}
        primary={String(data.users.total)}
        secondary={t('dashboard.kpi.activeUsersHint', { count: data.users.newThisMonth })}
        accent="#8B5CF6"
      />
      <KpiCard
        icon="📋"
        label={t('dashboard.kpi.workOrders')}
        primary={String(data.workOrders.createdThisMonth)}
        secondary={t('dashboard.kpi.workOrdersHint', { count: data.workOrders.completedThisMonth })}
        accent={theme.colors.warning}
      />
      <KpiCard
        icon="💾"
        label={t('dashboard.kpi.storage')}
        primary={formatBytes(data.storage.totalBytes)}
        secondary={t('dashboard.kpi.storageHint')}
        accent={theme.colors.textMuted}
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  primary,
  secondary,
  accent,
}: {
  icon: string;
  label: string;
  primary: string;
  secondary: string;
  accent: string;
}) {
  return (
    <div
      style={{
        ...cardStyles.card,
        padding: 16,
        borderLeft: `4px solid ${accent}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          fontWeight: 600,
        }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: theme.colors.text, marginTop: 4 }}>
        {primary}
      </div>
      <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
        {secondary}
      </div>
    </div>
  );
}

// ─── Per-tenant table ──────────────────────────────────────────────

function TenantUsageTable({
  rows,
  plans,
}: {
  rows: TenantUsageRow[];
  plans: Map<string, PlanDefinition>;
}) {
  const { t } = useTranslation('superAdmin');
  if (rows.length === 0) {
    return <Placeholder text={t('dashboard.table.empty')} />;
  }
  return (
    <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: theme.colors.surfaceAlt }}>
            <Th>{t('dashboard.table.tenant')}</Th>
            <Th>{t('dashboard.table.plan')}</Th>
            <Th>{t('dashboard.table.billing')}</Th>
            <Th>{t('dashboard.table.users')}</Th>
            <Th>{t('dashboard.table.sessions')}</Th>
            <Th>{t('dashboard.table.workOrders')}</Th>
            <Th>{t('dashboard.table.clients')}</Th>
            <Th>{t('dashboard.table.storage')}</Th>
            <Th>{t('dashboard.table.lastActivity')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <TenantRow key={r.id} row={r} plan={plans.get(r.plan)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TenantRow({
  row,
  plan,
}: {
  row: TenantUsageRow;
  plan: PlanDefinition | undefined;
}) {
  const { t } = useTranslation('superAdmin');
  const storageMb = row.storage.bytes / 1024 / 1024;
  const lastActivity = mostRecent(row.lastLoginAt, row.lastWorkOrderAt, row.createdAt);
  const sessionsTint =
    row.users.sessions === 0
      ? theme.colors.textMuted
      : row.users.sessions >= 3
      ? theme.colors.success
      : theme.colors.text;

  return (
    <tr style={{ borderTop: `1px solid ${theme.colors.border}` }}>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{row.name}</span>
          <code style={{ fontSize: 11, color: theme.colors.primary }}>
            {row.slug}
          </code>
        </div>
        {!row.isActive && (
          <span
            style={{
              display: 'inline-block',
              marginTop: 4,
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 3,
              background: theme.colors.dangerLight,
              color: theme.colors.danger,
              fontWeight: 600,
            }}
          >
            {t('dashboard.table.suspended')}
          </span>
        )}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <PlanPill plan={row.plan} />
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', minWidth: 140 }}>
        <BillingCell row={row} plan={plan} />
      </td>
      <td style={{ padding: '10px 12px', minWidth: 160 }}>
        <UsageBar current={row.users.active} max={row.users.max} />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{ fontWeight: 600, color: sessionsTint }}>
          {row.users.sessions > 0 ? '🟢 ' : '⚪ '}
          {row.users.sessions}
        </span>
        <div style={{ fontSize: 10, color: theme.colors.textMuted, marginTop: 2 }}>
          {row.users.sessions > 0
            ? t('dashboard.table.connected', { count: row.users.sessions })
            : t('dashboard.table.noOne')}
        </div>
      </td>
      <td style={{ padding: '10px 12px', minWidth: 160 }}>
        <UsageBar
          current={row.workOrders.thisMonth}
          max={row.workOrders.max}
        />
        <div style={{ fontSize: 10, color: theme.colors.textMuted, marginTop: 2 }}>
          {t('dashboard.table.totalCumulative', { count: row.workOrders.total })}
        </div>
      </td>
      <td style={{ padding: '10px 12px', minWidth: 140 }}>
        <UsageBar current={row.clients.count} max={row.clients.max} />
      </td>
      <td style={{ padding: '10px 12px', minWidth: 160 }}>
        <UsageBar
          currentLabel={formatBytes(row.storage.bytes)}
          maxLabel={`${row.storage.maxMb} MB`}
          current={storageMb}
          max={row.storage.maxMb}
        />
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 12 }}>
          {lastActivity ? formatRelative(lastActivity, t) : '—'}
        </span>
      </td>
    </tr>
  );
}

function UsageBar({
  current,
  max,
  currentLabel,
  maxLabel,
}: {
  current: number;
  max: number;
  currentLabel?: string;
  maxLabel?: string;
}) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const color =
    pct >= 90
      ? theme.colors.danger
      : pct >= 70
      ? theme.colors.warning
      : theme.colors.success;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: 12,
          marginBottom: 2,
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {currentLabel ?? current}
          <span style={{ color: theme.colors.textMuted, fontWeight: 400 }}>
            {' / '}
            {maxLabel ?? max}
          </span>
        </span>
        <span style={{ fontSize: 10, color, fontWeight: 600 }}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          width: '100%',
          background: theme.colors.surfaceAlt,
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

function BillingCell({
  row,
  plan,
}: {
  row: TenantUsageRow;
  plan: PlanDefinition | undefined;
}) {
  const { t, i18n } = useTranslation('superAdmin');
  const numberLocale = i18n.language === 'en' ? 'en-CA' : 'fr-CA';
  if (!plan) {
    return <span style={{ color: theme.colors.textMuted }}>—</span>;
  }
  const total = monthlyCharge(row, plan);
  const breakdown: string[] = [];
  if (plan.priceMonthly > 0) {
    breakdown.push(
      t('dashboard.table.billingBase', {
        amount: plan.priceMonthly,
        currency: plan.currency,
      }),
    );
  }
  if (plan.pricePerUserMonthly > 0) {
    breakdown.push(
      t('dashboard.table.billingPerUser', {
        count: row.users.active,
        amount: plan.pricePerUserMonthly,
        currency: plan.currency,
      }),
    );
  }
  return (
    <div>
      <div style={{ fontWeight: 700 }}>
        {total === 0
          ? t('dashboard.table.free')
          : `${total.toLocaleString(numberLocale)} ${plan.currency}`}
      </div>
      {breakdown.length > 0 && (
        <div style={{ fontSize: 10, color: theme.colors.textMuted, marginTop: 2 }}>
          {breakdown.join(' + ')}
        </div>
      )}
    </div>
  );
}

function PlanPill({ plan }: { plan: string }) {
  const styles: Record<string, { bg: string; fg: string }> = {
    FREE: { bg: theme.colors.surfaceAlt, fg: theme.colors.textMuted },
    PRO: { bg: 'rgba(59, 130, 246, 0.15)', fg: theme.colors.primary },
    ENTERPRISE: { bg: 'rgba(139, 92, 246, 0.15)', fg: '#8B5CF6' },
  };
  const c = styles[plan] ?? styles.FREE;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        letterSpacing: 0.5,
      }}
    >
      {plan}
    </span>
  );
}

// ─── Generic helpers ───────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '10px 12px',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: theme.colors.textMuted,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}
    >
      {children}
    </th>
  );
}

function Placeholder({ text, error }: { text: string; error?: boolean }) {
  return (
    <div
      style={{
        ...cardStyles.card,
        padding: 24,
        textAlign: 'center',
        color: error ? theme.colors.danger : theme.colors.textMuted,
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function monthlyCharge(
  row: TenantUsageRow,
  plan: PlanDefinition | undefined,
): number {
  if (!plan) return 0;
  return plan.priceMonthly + row.users.active * plan.pricePerUserMonthly;
}

function mostRecent(...dates: Array<string | null | undefined>): Date | null {
  const valid = dates
    .filter((d): d is string => !!d)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}

function formatRelative(
  d: Date,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return t('dashboard.relative.justNow');
  if (diff < 60 * 60_000) {
    return t('dashboard.relative.minutes', { count: Math.floor(diff / 60_000) });
  }
  if (diff < 24 * 60 * 60_000) {
    return t('dashboard.relative.hours', { count: Math.floor(diff / 3_600_000) });
  }
  if (diff < 7 * 24 * 60 * 60_000) {
    return t('dashboard.relative.days', { count: Math.floor(diff / 86_400_000) });
  }
  return d.toLocaleDateString();
}
