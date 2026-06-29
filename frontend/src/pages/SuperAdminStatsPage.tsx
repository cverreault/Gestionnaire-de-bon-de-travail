import { useQuery } from '@tanstack/react-query';
import { theme, cardStyles, layoutStyles } from '../theme';
import { getStats, type SuperAdminStats } from '../services/super-admin.service';

/**
 * Cross-tenant stats snapshot for the SA (B7).
 *
 * Four KPI groups, each rendered as a small card grid. Refresh every
 * 30 s so the SA sees fresh counts after a signup or a quota change
 * without having to F5.
 */
export default function SuperAdminStatsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['superAdmin', 'stats'],
    queryFn: getStats,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>📊 Stats globales</h1>
        <p style={{ color: theme.colors.textMuted, margin: '4px 0 0' }}>
          Snapshot cross-tenant — rafraîchi toutes les 30 s.
        </p>
      </header>

      {isLoading && <p>Chargement…</p>}
      {error && (
        <p style={{ color: theme.colors.danger }}>
          Échec du chargement des stats.
        </p>
      )}
      {data && <Sections data={data} />}
    </div>
  );
}

function Sections({ data }: { data: SuperAdminStats }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Group title="🌍 Tenants">
        <Card label="Total" value={data.tenants.total} />
        <Card label="Actifs" value={data.tenants.active} />
        <Card label="Nouveaux ce mois" value={data.tenants.newThisMonth} />
      </Group>

      <Group title="👥 Utilisateurs">
        <Card label="Actifs total" value={data.users.total} />
        <Card label="Nouveaux ce mois" value={data.users.newThisMonth} />
      </Group>

      <Group title="📋 Bons de travail (ce mois)">
        <Card label="Créés" value={data.workOrders.createdThisMonth} />
        <Card label="Complétés" value={data.workOrders.completedThisMonth} />
      </Group>

      <Group title="💾 Stockage">
        <Card
          label="Total"
          value={formatBytes(data.storage.totalBytes)}
        />
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ ...cardStyles.card, padding: 16 }}>
      <h3 style={{ margin: '0 0 12px', color: theme.colors.text, fontSize: 14 }}>
        {title}
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 6,
        background: theme.colors.surfaceAlt,
        borderLeft: `4px solid ${theme.colors.primary}`,
      }}
    >
      <div style={{ fontSize: 11, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: theme.colors.text, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
