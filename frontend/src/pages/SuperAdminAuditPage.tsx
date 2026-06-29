import { useState, FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { theme, cardStyles, layoutStyles, buttonStyles, formStyles } from '../theme';
import { searchAudit, type AuditQuery } from '../services/super-admin.service';

/**
 * Cross-tenant audit log search (B7).
 *
 * Form-driven query (no live filter) so the SA explicitly hits
 * Rechercher — the audit volume can be large and we don't want every
 * keystroke firing a DB query.
 */
export default function SuperAdminAuditPage() {
  const [filters, setFilters] = useState<AuditQuery>({ page: 1, limit: 50 });
  const [submitted, setSubmitted] = useState<AuditQuery | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['superAdmin', 'audit', submitted],
    queryFn: () => searchAudit(submitted ?? {}),
    enabled: submitted !== null,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted({ ...filters, page: 1 });
  };

  const changePage = (next: number) => {
    if (!submitted) return;
    setSubmitted({ ...submitted, page: next });
  };

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>📜 Audit cross-tenant</h1>
        <p style={{ color: theme.colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
          Recherche dans les audit logs à travers tous les tenants.
        </p>
      </header>

      <form
        onSubmit={submit}
        style={{ ...cardStyles.card, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Field label="Depuis (ISO)">
            <input
              type="datetime-local"
              value={filters.from?.slice(0, 16) ?? ''}
              onChange={(e) => setFilters({ ...filters, from: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
              style={formStyles.input}
            />
          </Field>
          <Field label="Jusqu'à (ISO)">
            <input
              type="datetime-local"
              value={filters.to?.slice(0, 16) ?? ''}
              onChange={(e) => setFilters({ ...filters, to: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
              style={formStyles.input}
            />
          </Field>
          <Field label="Tenant slug">
            <input
              value={filters.tenantSlug ?? ''}
              onChange={(e) => setFilters({ ...filters, tenantSlug: e.target.value || undefined })}
              placeholder="ex: democamp"
              style={formStyles.input}
            />
          </Field>
          <Field label="Actor (user UUID)">
            <input
              value={filters.actor ?? ''}
              onChange={(e) => setFilters({ ...filters, actor: e.target.value || undefined })}
              style={formStyles.input}
            />
          </Field>
          <Field label="Event name (préfixe)">
            <input
              value={filters.eventName ?? ''}
              onChange={(e) => setFilters({ ...filters, eventName: e.target.value || undefined })}
              placeholder="ex: workOrders."
              style={formStyles.input}
            />
          </Field>
        </div>
        <button type="submit" style={{ ...buttonStyles.primary, alignSelf: 'flex-start' }}>
          🔍 Rechercher
        </button>
      </form>

      {isFetching && <p>Recherche…</p>}

      {data && (
        <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${theme.colors.border}`, fontSize: 13, color: theme.colors.textMuted }}>
            {data.pagination.total} résultat{data.pagination.total > 1 ? 's' : ''} —
            page {data.pagination.page} / {Math.max(1, Math.ceil(data.pagination.total / data.pagination.limit))}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ background: theme.colors.surfaceAlt }}>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Tenant</th>
                <th style={th}>Event</th>
                <th style={th}>Aggregate</th>
                <th style={th}>Actor</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((row) => (
                <tr key={row.id} style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                  <td style={td}>{new Date(row.occurredAt).toLocaleString()}</td>
                  <td style={td}>{row.tenantSlug ?? row.tenantId.slice(0, 8)}</td>
                  <td style={td}>
                    <code style={{ fontSize: 11 }}>{row.eventName}</code>
                  </td>
                  <td style={td}>
                    <code style={{ fontSize: 10, color: theme.colors.textMuted }}>
                      {row.aggregateId?.slice(0, 12) ?? '—'}
                    </code>
                  </td>
                  <td style={td}>
                    <code style={{ fontSize: 10, color: theme.colors.textMuted }}>
                      {row.actorUserId?.slice(0, 12) ?? 'sys'}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: 12, borderTop: `1px solid ${theme.colors.border}` }}>
            <button
              disabled={data.pagination.page <= 1}
              onClick={() => changePage(data.pagination.page - 1)}
              style={buttonStyles.secondary}
            >
              ◀ Précédent
            </button>
            <button
              disabled={data.pagination.page * data.pagination.limit >= data.pagination.total}
              onClick={() => changePage(data.pagination.page + 1)}
              style={buttonStyles.secondary}
            >
              Suivant ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: 8,
  fontWeight: 600,
  color: theme.colors.text,
};
const td: React.CSSProperties = { padding: 8, color: theme.colors.text };
