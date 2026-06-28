import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useWorkOrders } from '../hooks/useWorkOrders';
import workOrdersService from '../services/work-orders.service';
import { WorkOrderStatus, WorkOrderType } from '../types';
import type { WorkOrderFilters, WorkOrder } from '../types';
import WorkOrderStatusBadge from '../components/WorkOrderStatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ColumnPicker, { type ColumnDef } from '../components/ColumnPicker';
import { useUserPreferences, useUpdateUserPreferences } from '../hooks/useUserPreferences';
import usersService from '../services/users.service';
import { theme, tableStyles, buttonStyles, formStyles, layoutStyles, getRowStyle } from '../theme';
import { formatStreet } from '../utils/addressFormat';

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPLETED_STATUSES = new Set([
  WorkOrderStatus.COMPLETED_POSITIVE,
  WorkOrderStatus.COMPLETED_NEGATIVE,
]);

const LS_HIDE_COMPLETED_KEY = 'wo-hide-completed';

// ─── Label maps ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<WorkOrderType, string> = {
  [WorkOrderType.INSTALLATION]: 'Installation',
  [WorkOrderType.REPAIR]: 'Réparation',
  [WorkOrderType.MAINTENANCE]: 'Maintenance',
  [WorkOrderType.INSPECTION]: 'Inspection',
  [WorkOrderType.OTHER]: 'Autre',
};

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.CREATED]: 'Créé',
  [WorkOrderStatus.ASSIGNED]: 'Assigné',
  [WorkOrderStatus.DISPATCHED]: 'Dispatché',
  [WorkOrderStatus.EN_ROUTE]: 'En route',
  [WorkOrderStatus.IN_PROGRESS]: 'En cours',
  [WorkOrderStatus.COMPLETED_POSITIVE]: 'Complété (positif)',
  [WorkOrderStatus.COMPLETED_NEGATIVE]: 'Complété (négatif)',
};

const PRIORITY_LABELS: Record<number, string> = {
  0: '0 — Aucune',
  1: '1 — Faible',
  2: '2 — Normale',
  3: '3 — Élevée',
  4: '4 — Urgente',
  5: '5 — Critique',
};

// ─── Active filter counter ────────────────────────────────────────────────────

function countActiveFilters(filters: Omit<WorkOrderFilters, 'page' | 'limit'>): number {
  let count = 0;
  if (filters.search?.trim()) count++;
  if (filters.status) count++;
  if (filters.type) count++;
  if (filters.assignedToId) count++;
  if (filters.scheduledDateFrom) count++;
  if (filters.scheduledDateTo) count++;
  if (filters.priorityMin !== undefined && filters.priorityMin > 0) count++;
  return count;
}

// ─── Column catalog for the work-orders table ─────────────────────────────────

const DEFAULT_WO_COLUMN_ORDER: string[] = [
  'referenceNumber',
  'title',
  'address',
  'type',
  'priority',
  'status',
  'technician',
  'scheduledDate',
];

function formatWoAddress(wo: WorkOrder): string {
  const rel = wo.clientAddress_rel;
  if (rel) {
    const street = `${formatStreet(rel)}${rel.apartment ? ` app. ${rel.apartment}` : ''}`;
    return `${street}, ${rel.city}${rel.postalCode ? ` ${rel.postalCode}` : ''}`;
  }
  return wo.clientAddress ?? '—';
}

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

function buildWorkOrderColumnCatalog(t: TFunc, tCommon: TFunc): ColumnDef<WorkOrder>[] {
  return [
    {
      id: 'referenceNumber',
      label: t('referenceNumber'),
      tdStyle: { ...tableStyles.cell, fontFamily: 'monospace' },
      render: (wo) => wo.referenceNumber,
    },
    {
      id: 'title',
      label: t('fields.title'),
      tdStyle: { ...tableStyles.cell, fontWeight: theme.font.weightMedium },
      render: (wo) => wo.title,
    },
    {
      id: 'address',
      label: t('fields.address'),
      tdStyle: { ...tableStyles.cellMuted },
      render: (wo) => formatWoAddress(wo),
    },
    {
      id: 'type',
      label: t('fields.type'),
      tdStyle: { ...tableStyles.cellMuted },
      render: (wo) => t(`types.${wo.type}`, { defaultValue: TYPE_LABELS[wo.type] }),
    },
    {
      id: 'priority',
      label: t('fields.priority'),
      render: (wo) => <PriorityBadge priority={wo.priority} />,
    },
    {
      id: 'status',
      label: t('fields.status'),
      render: (wo) => <WorkOrderStatusBadge step={wo.currentStep} status={wo.status} size="sm" />,
    },
    {
      id: 'technician',
      label: t('fields.technician'),
      render: (wo) => (wo.assignedTo ? `${wo.assignedTo.firstName} ${wo.assignedTo.lastName}` : '—'),
    },
    {
      id: 'scheduledDate',
      label: t('fields.scheduledDate'),
      tdStyle: { ...tableStyles.cellMuted },
      render: (wo) => (wo.scheduledDate ? new Date(wo.scheduledDate).toLocaleDateString(t('common:bcp47', { defaultValue: 'fr-CA' })) : '—'),
    },
    {
      id: 'actions',
      label: tCommon('labels.actions'),
      locked: true,
      render: (wo) => (
        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
          <Link
            to={`/bons-de-travail/${wo.id}`}
            style={{
              color: theme.colors.primary,
              fontSize: theme.font.sizeSm,
              fontWeight: theme.font.weightMedium,
              textDecoration: 'none',
              padding: '0.25rem 0.5rem',
              borderRadius: theme.radius.sm,
              border: `1px solid ${theme.colors.primary}40`,
              background: theme.colors.primaryLight,
              whiteSpace: 'nowrap',
            }}
          >
            Voir
          </Link>
          <Link
            to={`/bons-de-travail/${wo.id}?edit=true`}
            title="Éditer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.25rem 0.4rem',
              borderRadius: theme.radius.sm,
              border: theme.borders.default,
              background: theme.colors.surface,
              color: theme.colors.textSecondary,
              fontSize: '0.8rem',
              textDecoration: 'none',
              lineHeight: 1,
            }}
          >
            ✏️
          </Link>
          {wo.status === WorkOrderStatus.CREATED && (
            <Link
              to={`/bons-de-travail/${wo.id}?assign=true`}
              title="Assigner un technicien"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.25rem 0.5rem',
                borderRadius: theme.radius.sm,
                border: `1px solid ${theme.colors.warning}60`,
                background: theme.colors.warningLight,
                color: '#92400e',
                fontSize: theme.font.sizeXs,
                fontWeight: theme.font.weightMedium,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              → Assigner
            </Link>
          )}
        </div>
      ),
    },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkOrdersPage() {
  const { t } = useTranslation('workOrders');
  const { t: tCommon } = useTranslation('common');
  // Filter state
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WorkOrderStatus | undefined>();
  const [type, setType] = useState<WorkOrderType | undefined>();
  const [assignedToId, setAssignedToId] = useState<string | undefined>();
  const [scheduledDateFrom, setScheduledDateFrom] = useState('');
  const [scheduledDateTo, setScheduledDateTo] = useState('');
  const [priorityMin, setPriorityMin] = useState<number | undefined>();
  const [page, setPage] = useState(1);

  // Panel visibility
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Hide completed toggle — persisted in localStorage
  const [hideCompleted, setHideCompleted] = useState<boolean>(
    () => localStorage.getItem(LS_HIDE_COMPLETED_KEY) === 'true',
  );

  // Row hover / drag state
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // CSV export in flight
  const [isExporting, setIsExporting] = useState(false);

  // Load technicians for the dropdown
  const { data: technicians = [] } = useQuery({
    queryKey: ['technicians'],
    queryFn: () => usersService.findTechnicians(),
    staleTime: 5 * 60 * 1000,
  });

  // ── Column preferences ──────────────────────────────────────────────────
  const { data: prefs } = useUserPreferences();
  const updatePrefs = useUpdateUserPreferences();
  const userVisible = prefs?.workOrderColumns;
  const visibleIds: string[] = userVisible && userVisible.length > 0
    ? userVisible
    : DEFAULT_WO_COLUMN_ORDER;

  const columnCatalog = useMemo(() => buildWorkOrderColumnCatalog(t, tCommon), [t, tCommon]);
  const catalogById = useMemo(() => {
    const m = new Map<string, ColumnDef<WorkOrder>>();
    for (const c of columnCatalog) m.set(c.id, c);
    return m;
  }, [columnCatalog]);

  // The "actions" column is locked → always appended last regardless of user order.
  const orderedColumns: ColumnDef<WorkOrder>[] = useMemo(() => {
    const out: ColumnDef<WorkOrder>[] = [];
    for (const id of visibleIds) {
      const col = catalogById.get(id);
      if (col && !col.locked) out.push(col);
    }
    const actions = catalogById.get('actions');
    if (actions) out.push(actions);
    return out;
  }, [visibleIds, catalogById]);

  function setColumnsOrder(next: string[]) {
    updatePrefs.mutate({ workOrderColumns: next });
  }

  // Build filters object for the query
  const filters: WorkOrderFilters = {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(scheduledDateFrom ? { scheduledDateFrom } : {}),
    ...(scheduledDateTo ? { scheduledDateTo } : {}),
    ...(priorityMin !== undefined && priorityMin > 0 ? { priorityMin } : {}),
    page,
    limit: 20,
  };

  const activeCount = countActiveFilters(filters);

  const { data, isLoading, error } = useWorkOrders(filters);
  const rawItems = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  // Client-side hide-completed filtering
  const items = useMemo(() => {
    if (!hideCompleted) return rawItems;
    return rawItems.filter((wo) => !COMPLETED_STATUSES.has(wo.status));
  }, [rawItems, hideCompleted]);

  const hiddenCompletedCount = useMemo(
    () => rawItems.filter((wo) => COMPLETED_STATUSES.has(wo.status)).length,
    [rawItems],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleResetFilters() {
    setSearch('');
    setStatus(undefined);
    setType(undefined);
    setAssignedToId(undefined);
    setScheduledDateFrom('');
    setScheduledDateTo('');
    setPriorityMin(undefined);
    setPage(1);
  }

  function handlePageChange(next: number) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleExportCsv() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const exportFilters = { ...filters };
      delete (exportFilters as { page?: number }).page;
      delete (exportFilters as { limit?: number }).limit;
      await workOrdersService.exportCsv(exportFilters);
    } catch (err) {
      console.error('[work-orders] CSV export failed', err);
      window.alert(t('list.exportFailed', { defaultValue: 'Export CSV impossible. Réessayez.' }));
    } finally {
      setIsExporting(false);
    }
  }

  function toggleHideCompleted() {
    setHideCompleted((prev) => {
      const next = !prev;
      localStorage.setItem(LS_HIDE_COMPLETED_KEY, String(next));
      return next;
    });
  }

  // ── DnD handlers ────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, woId: string, woTitle: string, woStatus: string) {
    e.dataTransfer.setData('workOrderId', woId);
    e.dataTransfer.setData('workOrderTitle', woTitle);
    e.dataTransfer.setData('workOrderStatus', woStatus);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(woId);
  }

  function handleDragEnd() {
    setDraggingId(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ ...layoutStyles.page }}>
      {/* Header */}
      <div style={{ ...layoutStyles.pageHeader }}>
        <h1 style={{ ...layoutStyles.pageTitle }}>{t('title')}</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Hide completed toggle */}
          <button
            onClick={toggleHideCompleted}
            title={hideCompleted ? t('list.showCompleted', { defaultValue: 'Afficher les BT complétés' }) : t('list.hideCompleted', { defaultValue: 'Masquer les BT complétés' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.875rem',
              borderRadius: theme.radius.md,
              border: hideCompleted
                ? `1px solid ${theme.colors.primary}`
                : theme.borders.default,
              background: hideCompleted ? theme.colors.primaryLight : theme.colors.surface,
              color: hideCompleted ? theme.colors.primary : theme.colors.textSecondary,
              fontWeight: theme.font.weightMedium,
              fontSize: theme.font.sizeSm,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            {hideCompleted ? `👁 ${t('list.showCompletedShort', { defaultValue: 'Afficher' })}` : `🚫 ${t('list.hideCompletedShort', { defaultValue: 'Masquer' })}`} {t('list.completedSuffix', { defaultValue: 'les complétés' })}
            {hideCompleted && hiddenCompletedCount > 0 && (
              <span
                style={{
                  background: theme.colors.primary,
                  color: '#fff',
                  borderRadius: theme.radius.full,
                  padding: '0 0.4rem',
                  fontSize: theme.font.sizeXs,
                  fontWeight: theme.font.weightBold,
                  lineHeight: '1.35rem',
                  minWidth: '1.35rem',
                  textAlign: 'center',
                  display: 'inline-block',
                }}
              >
                {hiddenCompletedCount}
              </span>
            )}
          </button>

          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            title={t('list.exportTooltip', { defaultValue: 'Exporter la liste filtrée (CSV)' })}
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
              cursor: isExporting ? 'wait' : 'pointer',
              opacity: isExporting ? 0.6 : 1,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            {isExporting
              ? `⏳ ${t('list.exporting', { defaultValue: 'Export…' })}`
              : `⬇ ${t('list.exportCsv', { defaultValue: 'Exporter CSV' })}`}
          </button>

          <Link
            to="/bons-de-travail/nouveau"
            style={{ ...buttonStyles.primary, textDecoration: 'none' }}
          >
            {t('create')}
          </Link>
        </div>
      </div>

      {/* ── Filter Panel ── */}
      <div
        style={{
          background: theme.colors.surfaceAlt,
          borderRadius: theme.radius.lg,
          border: theme.borders.default,
          padding: '1rem',
          marginBottom: '1.5rem',
          boxShadow: theme.shadows.sm,
        }}
      >
        {/* Row 1 — always visible */}
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* Search text */}
          <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
            <input
              type="text"
              placeholder={t('list.searchPlaceholder', { defaultValue: 'Rechercher (titre, référence, client, adresse…)' })}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ ...formStyles.input }}
            />
          </div>

          {/* Status */}
          <div style={{ flex: '0 0 auto', minWidth: '160px' }}>
            <select
              value={status ?? ''}
              onChange={(e) => { setStatus(e.target.value as WorkOrderStatus || undefined); setPage(1); }}
              style={{ ...formStyles.select }}
            >
              <option value="">{t('list.allStatuses', { defaultValue: 'Tous les statuts' })}</option>
              {Object.values(WorkOrderStatus).map((s) => (
                <option key={s} value={s}>{t(`statuses.${s}`, { defaultValue: STATUS_LABELS[s] })}</option>
              ))}
            </select>
          </div>

          {/* Toggle button */}
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.875rem',
              borderRadius: theme.radius.md,
              border: theme.borders.default,
              background: showAdvanced ? theme.colors.primaryLight : theme.colors.surface,
              color: showAdvanced ? theme.colors.primary : theme.colors.text,
              fontWeight: theme.font.weightMedium,
              fontSize: theme.font.sizeSm,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {showAdvanced ? `▲ ${t('list.fewerFilters', { defaultValue: 'Moins de filtres' })}` : `▼ ${t('list.moreFilters', { defaultValue: 'Plus de filtres' })}`}
            {activeCount > 0 && (
              <span
                style={{
                  background: theme.colors.primary,
                  color: '#fff',
                  borderRadius: theme.radius.full,
                  padding: '0 0.45rem',
                  fontSize: theme.font.sizeXs,
                  fontWeight: theme.font.weightBold,
                  lineHeight: '1.4rem',
                  minWidth: '1.4rem',
                  textAlign: 'center',
                  display: 'inline-block',
                }}
              >
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {/* Row 2 — advanced (collapsible) */}
        {showAdvanced && (
          <div
            style={{
              marginTop: '0.875rem',
              paddingTop: '0.875rem',
              borderTop: theme.borders.light,
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
            }}
          >
            {/* Type */}
            <div style={{ flex: '0 1 160px', minWidth: '130px' }}>
              <label style={{ display: 'block', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem', fontWeight: theme.font.weightMedium }}>
                {t('fields.type')}
              </label>
              <select
                value={type ?? ''}
                onChange={(e) => { setType(e.target.value as WorkOrderType || undefined); setPage(1); }}
                style={{ ...formStyles.select }}
              >
                <option value="">{tCommon('labels.all')}</option>
                {Object.values(WorkOrderType).map((ty) => (
                  <option key={ty} value={ty}>{t(`types.${ty}`, { defaultValue: TYPE_LABELS[ty] })}</option>
                ))}
              </select>
            </div>

            {/* Technician */}
            <div style={{ flex: '0 1 180px', minWidth: '140px' }}>
              <label style={{ display: 'block', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem', fontWeight: theme.font.weightMedium }}>
                {t('fields.technician')}
              </label>
              <select
                value={assignedToId ?? ''}
                onChange={(e) => { setAssignedToId(e.target.value || undefined); setPage(1); }}
                style={{ ...formStyles.select }}
              >
                <option value="">{tCommon('labels.all')}</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.firstName} {tech.lastName}
                  </option>
                ))}
              </select>
            </div>

            {/* Scheduled date from */}
            <div style={{ flex: '0 1 160px', minWidth: '130px' }}>
              <label style={{ display: 'block', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem', fontWeight: theme.font.weightMedium }}>
                {t('list.dateFrom', { defaultValue: 'Date planifiée de' })}
              </label>
              <input
                type="date"
                value={scheduledDateFrom}
                onChange={(e) => { setScheduledDateFrom(e.target.value); setPage(1); }}
                style={{ ...formStyles.input }}
              />
            </div>

            {/* Scheduled date to */}
            <div style={{ flex: '0 1 160px', minWidth: '130px' }}>
              <label style={{ display: 'block', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem', fontWeight: theme.font.weightMedium }}>
                {t('list.dateTo', { defaultValue: 'Date planifiée à' })}
              </label>
              <input
                type="date"
                value={scheduledDateTo}
                onChange={(e) => { setScheduledDateTo(e.target.value); setPage(1); }}
                style={{ ...formStyles.input }}
              />
            </div>

            {/* Priority min */}
            <div style={{ flex: '0 1 155px', minWidth: '130px' }}>
              <label style={{ display: 'block', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem', fontWeight: theme.font.weightMedium }}>
                {t('list.priorityMin', { defaultValue: 'Priorité minimum' })}
              </label>
              <select
                value={priorityMin ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setPriorityMin(v === '' ? undefined : Number(v));
                  setPage(1);
                }}
                style={{ ...formStyles.select }}
              >
                <option value="">{tCommon('labels.all')}</option>
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>

            {/* Reset button */}
            <div style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
              <button
                onClick={handleResetFilters}
                disabled={activeCount === 0}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: theme.radius.md,
                  border: '1px solid var(--c-dangerBadgeBorder)',
                  background: activeCount === 0 ? theme.colors.surfaceAlt : theme.colors.dangerLight,
                  color: activeCount === 0 ? theme.colors.textLight : theme.colors.danger,
                  fontWeight: theme.font.weightMedium,
                  fontSize: theme.font.sizeSm,
                  cursor: activeCount === 0 ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                ✕ {tCommon('actions.reset')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <div style={{ color: theme.colors.danger, padding: '1rem' }}>{tCommon('labels.error')}</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', color: theme.colors.textLight, padding: '3rem' }}>
          {hideCompleted && hiddenCompletedCount > 0
            ? `${hiddenCompletedCount} ${t('list.hiddenCompletedSuffix', { defaultValue: 'BT complétés masqués' })}`
            : activeCount > 0
            ? t('list.noMatch', { defaultValue: 'Aucun bon de travail ne correspond aux filtres sélectionnés' })
            : t('messages.noResult')}
        </div>
      ) : (
        <>
          {/* Results count */}
          <div style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted, marginBottom: '0.75rem' }}>
            {items.length} {tCommon('labels.results', { defaultValue: 'résultats' })}
            {hideCompleted && hiddenCompletedCount > 0 && (
              <span style={{ marginLeft: '0.5rem', color: theme.colors.textLight, fontStyle: 'italic' }}>
                ({hiddenCompletedCount} {t('list.hiddenCompletedSuffix', { defaultValue: 'complétés masqués' })})
              </span>
            )}
            {activeCount > 0 && (
              <span style={{ marginLeft: '0.5rem', color: theme.colors.primary, fontWeight: theme.font.weightMedium }}>
                ({activeCount} filtre{activeCount > 1 ? 's' : ''} actif{activeCount > 1 ? 's' : ''})
              </span>
            )}
          </div>

          {/* Drag hint + Column picker */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textLight }}>
              💡 Glissez une ligne sur un technicien dans la barre latérale pour dispatcher rapidement.
            </span>
            <ColumnPicker
              catalog={columnCatalog as ColumnDef<unknown>[]}
              visible={visibleIds}
              onChange={setColumnsOrder}
            />
          </div>

          {/* Table */}
          <div style={{ ...tableStyles.container }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ ...tableStyles.header }}>
                <tr>
                  {orderedColumns.map((col) => (
                    <th key={col.id} style={{ ...tableStyles.headerCell, textAlign: 'left' }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((wo, index) => {
                  const isDraggable = true;
                  return (
                    <tr
                      key={wo.id}
                      draggable={isDraggable}
                      onDragStart={isDraggable ? (e) => handleDragStart(e, wo.id, wo.title, wo.status) : undefined}
                      onDragEnd={isDraggable ? handleDragEnd : undefined}
                      style={{
                        ...getRowStyle(index, hoveredRow === index),
                        cursor: draggingId === wo.id ? 'grabbing' : isDraggable ? 'grab' : 'default',
                        ...(draggingId === wo.id
                          ? {
                              background: theme.colors.primaryLight,
                              outline: `2px dashed ${theme.colors.primary}`,
                              outlineOffset: '-2px',
                              opacity: 0.85,
                            }
                          : {}),
                        transition: 'background 0.12s ease, outline-color 0.12s ease',
                      }}
                      onMouseEnter={() => setHoveredRow(index)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      {orderedColumns.map((col) => (
                        <td key={col.id} style={{ ...(col.tdStyle ?? tableStyles.cell) }}>
                          {col.render(wo, index)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '1.5rem',
              }}
            >
              <button
                disabled={page === 1}
                onClick={() => handlePageChange(page - 1)}
                style={{
                  padding: '0.4rem 0.875rem',
                  border: theme.borders.default,
                  borderRadius: theme.radius.sm,
                  cursor: page === 1 ? 'default' : 'pointer',
                  background: page === 1 ? theme.colors.surfaceAlt : theme.colors.surface,
                  color: theme.colors.text,
                }}
              >
                ‹
              </button>
              <span style={{ padding: '0.4rem 0.875rem', fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
                Page {page} / {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => handlePageChange(page + 1)}
                style={{
                  padding: '0.4rem 0.875rem',
                  border: theme.borders.default,
                  borderRadius: theme.radius.sm,
                  cursor: page === totalPages ? 'default' : 'pointer',
                  background: page === totalPages ? theme.colors.surfaceAlt : theme.colors.surface,
                  color: theme.colors.text,
                }}
              >
                ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Priority badge sub-component ────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: number }) {
  const configs: Record<number, { label: string; bg: string; color: string }> = {
    0: { label: '—', bg: theme.colors.surfaceAlt, color: theme.colors.textLight },
    1: { label: '↓ Faible', bg: '#f0fdf4', color: '#16a34a' },
    2: { label: '→ Normale', bg: '#eff6ff', color: '#2563eb' },
    3: { label: '↑ Élevée', bg: '#fffbeb', color: '#d97706' },
    4: { label: '‼ Urgente', bg: '#fff7ed', color: '#ea580c' },
    5: { label: '🔴 Critique', bg: '#fef2f2', color: '#dc2626' },
  };
  const cfg = configs[priority] ?? configs[0];

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.2rem 0.5rem',
        borderRadius: theme.radius.sm,
        background: cfg.bg,
        color: cfg.color,
        fontSize: '0.775rem',
        fontWeight: theme.font.weightSemibold,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}
