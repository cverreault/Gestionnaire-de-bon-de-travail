import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useAuditList } from '../hooks/useAudit';
import { exportAuditCsv, type AuditListParams } from '../services/audit.service';
import api from '../services/api';
import type { User, ApiResponse } from '../types';
import { theme, tableStyles, layoutStyles, formStyles } from '../theme';
import { formatDateTime } from '../utils/dateFormat';

// Known event names — keeps the dropdown manageable. Add new entries as the
// platform emits them; the text input below the dropdown lets the operator
// query an exact arbitrary name.
const KNOWN_EVENTS = [
  'workOrders.workOrder.created',
  'workOrders.workOrder.assigned',
  'workOrders.workOrder.dispatched',
  'workOrders.workOrder.statusChanged',
  'workOrders.workOrder.completed',
];

function eventIcon(eventName: string): string {
  switch (eventName) {
    case 'workOrders.workOrder.created':       return '✨';
    case 'workOrders.workOrder.assigned':      return '👤';
    case 'workOrders.workOrder.dispatched':    return '🚚';
    case 'workOrders.workOrder.statusChanged': return '🔁';
    case 'workOrders.workOrder.completed':     return '✅';
    default: return '•';
  }
}

function shortenId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-3)}` : id;
}

export default function AuditPage() {
  const { t } = useTranslation('common');
  const [searchParams] = useSearchParams();

  // Filter state — all optional, applied to the React Query key.
  const [eventName, setEventName] = useState('');
  const [aggregateId, setAggregateId] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isExporting, setIsExporting] = useState(false);

  // Drill-down from the per-BT timeline: WorkOrderAuditTimeline links to
  // /audit?aggregateId=<id> for the aggregate pivot or /audit?actorUserId=<id>
  // for the actor pivot. We apply the params once on mount; further user
  // edits are local state from that point on.
  useEffect(() => {
    const fromAggregate = searchParams.get('aggregateId');
    if (fromAggregate && !aggregateId) setAggregateId(fromAggregate);
    const fromActor = searchParams.get('actorUserId');
    if (fromActor && !actorUserId) setActorUserId(fromActor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lookup of all users for the actor filter dropdown. ADMIN-only endpoint
  // and the page itself is ADMIN-only, so role check is implicit.
  const { data: users = [] } = useQuery({
    queryKey: ['users', 'all', 'for-audit-filter'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<User[]>>('/users');
      return data.data;
    },
    staleTime: 5 * 60_000,
  });

  const params = useMemo<AuditListParams>(() => ({
    page,
    limit,
    ...(eventName.trim() ? { eventName: eventName.trim() } : {}),
    ...(aggregateId.trim() ? { aggregateId: aggregateId.trim() } : {}),
    ...(actorUserId ? { actorUserId } : {}),
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to).toISOString() } : {}),
  }), [page, eventName, aggregateId, actorUserId, from, to]);

  const { data, isLoading, isError } = useAuditList(params);
  const rows = data?.data ?? [];
  const meta = data?.meta;

  function resetFilters() {
    setEventName('');
    setAggregateId('');
    setActorUserId('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  async function handleExportCsv() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportAuditCsv(params);
    } catch (err) {
      console.error('[audit] CSV export failed', err);
      window.alert(t('common:auditPage.exportFailed', { defaultValue: 'Export CSV impossible. Réessayez.' }));
    } finally {
      setIsExporting(false);
    }
  }

  const activeFilters =
    (eventName ? 1 : 0) + (aggregateId ? 1 : 0) + (actorUserId ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);

  return (
    <div style={{ ...layoutStyles.page }}>
      <div style={{ ...layoutStyles.pageHeader }}>
        <h1 style={{ ...layoutStyles.pageTitle }}>📜 {t('common:auditPage.title', { defaultValue: 'Audit' })}</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
            {meta ? t('common:auditPage.entriesCount', { defaultValue: '{{count}} entrées', count: meta.total }) : '—'}
          </span>
          <button
            onClick={handleExportCsv}
            disabled={isExporting || !meta || meta.total === 0}
            title={t('common:auditPage.exportCsvTitle', { defaultValue: 'Exporter la slice filtrée au format CSV (max 5000 lignes)' })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.875rem',
              borderRadius: theme.radius.md,
              border: theme.borders.default,
              background: theme.colors.surface,
              color: theme.colors.textSecondary,
              fontWeight: theme.font.weightMedium,
              fontSize: theme.font.sizeSm,
              cursor: isExporting || !meta || meta.total === 0 ? 'not-allowed' : 'pointer',
              opacity: isExporting || !meta || meta.total === 0 ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {isExporting ? `⏳ ${t('common:auditPage.exporting', { defaultValue: 'Export…' })}` : `⬇ ${t('common:auditPage.exportCsv', { defaultValue: 'Exporter CSV' })}`}
          </button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div
        style={{
          background: theme.colors.surfaceAlt,
          borderRadius: theme.radius.lg,
          border: theme.borders.default,
          padding: '1rem',
          marginBottom: '1.5rem',
          boxShadow: theme.shadows.sm,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ flex: '0 1 240px', minWidth: '180px' }}>
          <label style={{ display: 'block', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem' }}>
            {t('common:auditPage.eventTypeLabel', { defaultValue: "Type d'événement" })}
          </label>
          <select
            value={eventName}
            onChange={(e) => { setEventName(e.target.value); setPage(1); }}
            style={{ ...formStyles.select }}
          >
            <option value="">{t('common:auditPage.allOption', { defaultValue: '— Tous —' })}</option>
            {KNOWN_EVENTS.map((n) => (
              <option key={n} value={n}>{eventIcon(n)} {n}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
          <label style={{ display: 'block', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem' }}>
            {t('common:auditPage.aggregateLabel', { defaultValue: "UUID d'agrégat (BT…)" })}
          </label>
          <input
            type="text"
            value={aggregateId}
            onChange={(e) => { setAggregateId(e.target.value); setPage(1); }}
            placeholder={t('common:auditPage.aggregatePlaceholder', { defaultValue: 'ex: workOrderId' })}
            style={{ ...formStyles.input }}
          />
        </div>

        <div style={{ flex: '0 1 220px', minWidth: '180px' }}>
          <label style={{ display: 'block', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem' }}>
            {t('common:auditPage.actorLabel', { defaultValue: 'Acteur' })}
          </label>
          <select
            value={actorUserId}
            onChange={(e) => { setActorUserId(e.target.value); setPage(1); }}
            style={{ ...formStyles.select }}
          >
            <option value="">{t('common:auditPage.allOption', { defaultValue: '— Tous —' })}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName} ({u.role})
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: '0 1 170px', minWidth: '140px' }}>
          <label style={{ display: 'block', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem' }}>
            {t('common:auditPage.fromLabel', { defaultValue: 'Depuis' })}
          </label>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            style={{ ...formStyles.input }}
          />
        </div>

        <div style={{ flex: '0 1 170px', minWidth: '140px' }}>
          <label style={{ display: 'block', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem' }}>
            {t('common:auditPage.toLabel', { defaultValue: "Jusqu'à" })}
          </label>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            style={{ ...formStyles.input }}
          />
        </div>

        <button
          onClick={resetFilters}
          disabled={activeFilters === 0}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: theme.radius.md,
            border: '1px solid var(--c-dangerBadgeBorder)',
            background: activeFilters === 0 ? theme.colors.surfaceAlt : theme.colors.dangerLight,
            color: activeFilters === 0 ? theme.colors.textLight : theme.colors.danger,
            fontWeight: theme.font.weightMedium,
            fontSize: theme.font.sizeSm,
            cursor: activeFilters === 0 ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ✕ {t('actions.reset', { defaultValue: 'Réinitialiser' })}
        </button>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      {isLoading && (
        <p style={{ color: theme.colors.textMuted, padding: '1rem' }}>
          {t('labels.loading', { defaultValue: 'Chargement…' })}
        </p>
      )}
      {isError && (
        <p style={{ color: theme.colors.danger, padding: '1rem' }}>
          {t('messages.genericError', { defaultValue: 'Erreur de chargement' })}
        </p>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <p style={{ color: theme.colors.textMuted, padding: '1rem', fontStyle: 'italic' }}>
          {t('common:auditPage.noEntries', { defaultValue: 'Aucune entrée pour ces filtres.' })}
        </p>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <>
          <div style={{ ...tableStyles.container }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ ...tableStyles.header }}>
                <tr>
                  <th style={{ ...tableStyles.headerCell, textAlign: 'left', width: '160px' }}>{t('common:auditPage.colWhen', { defaultValue: 'Quand' })}</th>
                  <th style={{ ...tableStyles.headerCell, textAlign: 'left' }}>{t('common:auditPage.colEvent', { defaultValue: 'Événement' })}</th>
                  <th style={{ ...tableStyles.headerCell, textAlign: 'left' }}>{t('common:auditPage.colAggregate', { defaultValue: 'Agrégat' })}</th>
                  <th style={{ ...tableStyles.headerCell, textAlign: 'left' }}>{t('common:auditPage.colActor', { defaultValue: 'Acteur' })}</th>
                  <th style={{ ...tableStyles.headerCell, textAlign: 'left' }}>{t('common:auditPage.colData', { defaultValue: 'Données' })}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOpen = !!expanded[r.id];
                  return (
                    <tr key={r.id} style={{ borderBottom: theme.borders.light }}>
                      <td style={{ ...tableStyles.cell, whiteSpace: 'nowrap', fontSize: theme.font.sizeXs, color: theme.colors.textSecondary }}>
                        {formatDateTime(r.occurredAt)}
                      </td>
                      <td style={{ ...tableStyles.cell, fontSize: theme.font.sizeSm }}>
                        <span style={{ marginRight: '0.4rem' }}>{eventIcon(r.eventName)}</span>
                        <span style={{ fontFamily: 'monospace' }}>{r.eventName}</span>
                      </td>
                      <td style={{ ...tableStyles.cell, fontSize: theme.font.sizeXs, fontFamily: 'monospace' }}>
                        <Link
                          to={`/bons-de-travail/${r.aggregateId}`}
                          title={r.aggregateId}
                          style={{ color: theme.colors.primary, textDecoration: 'none' }}
                        >
                          {shortenId(r.aggregateId)}
                        </Link>
                      </td>
                      <td style={{ ...tableStyles.cell, fontSize: theme.font.sizeSm }}>
                        {r.actor
                          ? `${r.actor.firstName} ${r.actor.lastName}`
                          : <span style={{ color: theme.colors.textMuted, fontStyle: 'italic' }}>{t('common:auditPage.systemActor', { defaultValue: 'Système' })}</span>}
                      </td>
                      <td style={{ ...tableStyles.cell, fontSize: theme.font.sizeXs }}>
                        {r.data && Object.keys(r.data).length > 0 ? (
                          <button
                            onClick={() => setExpanded((m) => ({ ...m, [r.id]: !m[r.id] }))}
                            style={{
                              background: 'none',
                              border: theme.borders.default,
                              borderRadius: theme.radius.sm,
                              padding: '0.15rem 0.5rem',
                              fontSize: theme.font.sizeXs,
                              cursor: 'pointer',
                              color: theme.colors.textSecondary,
                            }}
                          >
                            {isOpen ? `▲ ${t('common:auditPage.hide', { defaultValue: 'Masquer' })}` : `▼ ${t('common:auditPage.view', { defaultValue: 'Voir' })}`}
                          </button>
                        ) : (
                          <span style={{ color: theme.colors.textMuted }}>—</span>
                        )}
                        {isOpen && r.data && (
                          <pre style={{
                            marginTop: '0.5rem',
                            padding: '0.5rem',
                            background: theme.colors.surfaceAlt,
                            border: theme.borders.light,
                            borderRadius: theme.radius.sm,
                            fontSize: '0.7rem',
                            color: theme.colors.text,
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}>
                            {JSON.stringify(r.data, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div style={{
              marginTop: '1rem',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: theme.font.sizeSm,
            }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={meta.page <= 1}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: theme.radius.md,
                  border: theme.borders.default,
                  background: meta.page <= 1 ? theme.colors.surfaceAlt : theme.colors.surface,
                  cursor: meta.page <= 1 ? 'not-allowed' : 'pointer',
                  color: theme.colors.text,
                }}
              >
                ← {t('common:auditPage.previous', { defaultValue: 'Précédent' })}
              </button>
              <span style={{ color: theme.colors.textSecondary, minWidth: '140px', textAlign: 'center' }}>
                {t('common:auditPage.pageOf', { defaultValue: 'Page {{page}} / {{total}}', page: meta.page, total: meta.totalPages })}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={meta.page >= meta.totalPages}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: theme.radius.md,
                  border: theme.borders.default,
                  background: meta.page >= meta.totalPages ? theme.colors.surfaceAlt : theme.colors.surface,
                  cursor: meta.page >= meta.totalPages ? 'not-allowed' : 'pointer',
                  color: theme.colors.text,
                }}
              >
                {t('common:auditPage.next', { defaultValue: 'Suivant' })} →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
