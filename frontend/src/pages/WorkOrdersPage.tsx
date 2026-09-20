import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useV3Clients } from '../hooks/useClients';
import { principalDisplayName } from '../components/PrincipalClientPicker';
import { useWorkOrders } from '../hooks/useWorkOrders';
import workOrdersService from '../services/work-orders.service';
import { WorkOrderStatus, WorkOrderType , ClientType } from '../types';
import type { WorkOrderFilters, WorkOrder } from '../types';
import WorkOrderStatusBadge from '../components/WorkOrderStatusBadge';
import SlaBadge from '../components/SlaBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ColumnPicker, { type ColumnDef } from '../components/ColumnPicker';
import { useUserPreferences, useUpdateUserPreferences } from '../hooks/useUserPreferences';
import usersService from '../services/users.service';
import { theme, tableStyles, buttonStyles, formStyles, layoutStyles, getRowStyle } from '../theme';
import { formatStreet } from '../utils/addressFormat';
import { priorityLabel } from '../utils/entityLabels';
import { periodRange, periodLabel, shiftPeriod, type PeriodScope } from '../utils/periodRange';
import TechnicianPanel from '../components/TechnicianPanel';
import DispatchBoard, { type DispatchSort } from '../components/DispatchBoard';
import { countByTechnician } from '../utils/dispatchBoard';
import WorkOrderModal from '../components/WorkOrderModal';
import DispatchConfirmModal, { type DispatchPayload } from '../components/DispatchConfirmModal';
import { TagChips } from '../components/TagChip';
import TagPicker from '../components/TagPicker';

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPLETED_STATUSES = new Set([
  WorkOrderStatus.COMPLETED_POSITIVE,
  WorkOrderStatus.COMPLETED_NEGATIVE,
]);

const LS_HIDE_COMPLETED_KEY = 'wo-hide-completed';
const LS_SLA_BREACHED_KEY = 'wo-sla-breached-only';
const LS_FILTER_PRESETS_KEY = 'wo-filter-presets';

// ─── Saved filter presets ─────────────────────────────────────────────────────

interface FilterPreset {
  search?: string;
  status?: WorkOrderStatus;
  type?: WorkOrderType;
  assignedToId?: string;
  scheduledDateFrom?: string;
  scheduledDateTo?: string;
  priorityMin?: number;
  /** B44 */
  tagIds?: string[];
}

/**
 * Relative share of the table width per column (fixed layout). Weights are normalised over the
 * visible columns at render time, so any subset sums to 100 % ; unlisted columns split the remainder.
 */
const COLUMN_WEIGHTS: Record<string, number> = {
  referenceNumber: 14,
  title: 15,
  address: 15,
  type: 7,
  priority: 8,
  status: 14,
  technician: 9,
  scheduledDate: 8,
  tags: 8,
  actions: 10,
};

/** Percent width per visible column (weights normalised to 100) ; undefined for unweighted columns. */
function columnWidths(ids: string[]): Record<string, string | undefined> {
  const total = ids.reduce((sum, id) => sum + (COLUMN_WEIGHTS[id] ?? 0), 0);
  const out: Record<string, string | undefined> = {};
  for (const id of ids) {
    const w = COLUMN_WEIGHTS[id];
    out[id] = w && total > 0 ? `${(w / total) * 100}%` : undefined;
  }
  return out;
}

function loadPresets(): Record<string, FilterPreset> {
  try {
    const raw = localStorage.getItem(LS_FILTER_PRESETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, FilterPreset>) : {};
  } catch {
    return {};
  }
}

function persistPresets(presets: Record<string, FilterPreset>): void {
  try {
    localStorage.setItem(LS_FILTER_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // localStorage full / private mode — silently degrade
  }
}

// ─── Label maps ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<WorkOrderType, string> = {
  [WorkOrderType.INSTALLATION]: 'Installation',
  [WorkOrderType.REPAIR]: 'Réparation',
  [WorkOrderType.MAINTENANCE]: 'Maintenance',
  [WorkOrderType.INSPECTION]: 'Inspection',
  [WorkOrderType.OTHER]: 'Autre',
};

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.REQUESTED]: 'Demandé',
  [WorkOrderStatus.CREATED]: 'Créé',
  [WorkOrderStatus.ASSIGNED]: 'Assigné',
  [WorkOrderStatus.DISPATCHED]: 'Dispatché',
  [WorkOrderStatus.EN_ROUTE]: 'En route',
  [WorkOrderStatus.IN_PROGRESS]: 'En cours',
  [WorkOrderStatus.COMPLETED_POSITIVE]: 'Complété (positif)',
  [WorkOrderStatus.COMPLETED_NEGATIVE]: 'Complété (négatif)',
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
  if (filters.tagIds && filters.tagIds.length > 0) count++;
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

function buildWorkOrderColumnCatalog(t: TFunc, tCommon: TFunc, onOpen: (id: string) => void): ColumnDef<WorkOrder>[] {
  return [
    {
      id: 'referenceNumber',
      label: t('referenceNumber'),
      tdStyle: { ...tableStyles.cell, fontFamily: 'monospace' },
      // Opens the work order in the overlay (B43 UI) — no page change.
      render: (wo) => (
        <button
          onClick={() => onOpen(wo.id)}
          title={t('list.openInModal', { defaultValue: 'Ouvrir le bon de travail' })}
          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: theme.colors.primary, fontWeight: theme.font.weightSemibold, textDecoration: 'underline', textUnderlineOffset: 3, fontSize: theme.font.sizeXs, letterSpacing: '-0.01em' }}
        >
          {wo.referenceNumber}
        </button>
      ),
    },
    {
      id: 'title',
      label: t('fields.title'),
      tdStyle: { ...tableStyles.cell, fontWeight: theme.font.weightMedium },
      // B44 — tags shown inline after the title so they are visible without enabling the column.
      render: (wo) => (
        <>
          {wo.title}
          {wo.tags && wo.tags.length > 0 && (
            <>
              {' '}
              <TagChips tags={wo.tags} max={3} wrap={false} />
            </>
          )}
        </>
      ),
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
      render: (wo) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <WorkOrderStatusBadge step={wo.currentStep} status={wo.status} size="sm" />
          <SlaBadge wo={wo} compact />
        </span>
      ),
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
      id: 'tags',
      label: t('fields.tags', { defaultValue: 'Tags' }),
      render: (wo) => <TagChips tags={wo.tags} max={2} wrap={false} />,
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
                color: 'var(--c-warningBadgeText)',
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
  const [principalClientId, setPrincipalClientId] = useState<string | undefined>();
  const [scheduledDateFrom, setScheduledDateFrom] = useState('');
  const [scheduledDateTo, setScheduledDateTo] = useState('');
  const [priorityMin, setPriorityMin] = useState<number | undefined>();
  // B44 — any of these tags
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  // Panel visibility
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Hide completed toggle — persisted in localStorage
  const [hideCompleted, setHideCompleted] = useState<boolean>(
    () => localStorage.getItem(LS_HIDE_COMPLETED_KEY) === 'true',
  );
  const [slaBreachedOnly, setSlaBreachedOnly] = useState<boolean>(
    () => localStorage.getItem(LS_SLA_BREACHED_KEY) === 'true',
  );

  // Row hover / drag state
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // CSV export in flight
  const [isExporting, setIsExporting] = useState(false);

  // Saved filter presets (per-browser via localStorage)
  const [presets, setPresets] = useState<Record<string, FilterPreset>>(() => loadPresets());
  const [activePreset, setActivePreset] = useState<string>('');

  // ── B43 UI — mode (liste / dispatch), période (jour / semaine / mois), popup ──
  const [mode, setModeState] = useState<'list' | 'dispatch'>(() => (localStorage.getItem('wo.mode') === 'dispatch' ? 'dispatch' : 'list'));
  const [scope, setScopeState] = useState<PeriodScope>(() => (localStorage.getItem('wo.scope') as PeriodScope) || 'all');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [dispatchSort, setDispatchSort] = useState<DispatchSort>(() => (localStorage.getItem('wo.dispatchSort') as DispatchSort) || 'time');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingDispatch, setPendingDispatch] = useState<DispatchPayload | null>(null);
  const qc = useQueryClient();
  const setMode = (m: 'list' | 'dispatch') => { localStorage.setItem('wo.mode', m); setModeState(m); setPage(1); };
  const setScope = (sc: PeriodScope) => { localStorage.setItem('wo.scope', sc); setScopeState(sc); setPage(1); };
  const period = periodRange(scope, anchor);
  const handleOpen = useCallback((id: string) => setOpenId(id), []);

  // B42 — donneurs d'ordre pour le filtre « Mandaté par »
  const { data: principalsData } = useV3Clients({ clientType: ClientType.PRINCIPAL, limit: 100 });
  const principals = principalsData?.data ?? [];

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

  const columnCatalog = useMemo(() => buildWorkOrderColumnCatalog(t, tCommon, handleOpen), [t, tCommon, handleOpen]);
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

  const colWidths = useMemo(() => columnWidths(orderedColumns.map((c) => c.id)), [orderedColumns]);

  function setColumnsOrder(next: string[]) {
    updatePrefs.mutate({ workOrderColumns: next });
  }

  // Build filters object for the query
  const filters: WorkOrderFilters = {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(assignedToId ? { assignedToId } : {}),
    ...(principalClientId ? { principalClientId } : {}),
    // The period bar (jour / semaine / mois) wins over the manual date fields.
    ...((period.from ?? scheduledDateFrom) ? { scheduledDateFrom: period.from ?? scheduledDateFrom } : {}),
    ...((period.to ?? scheduledDateTo) ? { scheduledDateTo: period.to ?? scheduledDateTo } : {}),
    ...(priorityMin !== undefined && priorityMin > 0 ? { priorityMin } : {}),
    ...(tagIds.length > 0 ? { tagIds } : {}),
    ...(slaBreachedOnly ? { slaBreached: true } : {}),
    // Dispatch mode shows the whole (active) set on one board.
    ...(mode === 'dispatch' ? { excludeCompleted: true, page: 1, limit: 100 } : { page, limit: 20 }),
  };

  const activeCount = countActiveFilters(filters);

  const { data, isLoading, error } = useWorkOrders(filters);
  // Whole active set for the technician panel counts (independent of the filters).
  const { data: activeSet } = useWorkOrders({ excludeCompleted: true, limit: 100 });
  const panelCounts = useMemo(() => countByTechnician(activeSet?.data ?? []), [activeSet]);

  async function handleUnassign(wo: WorkOrder) {
    // « Non assigné » column : go back to the initial step through the process (the engine clears the technician).
    const avail = await workOrdersService.getAvailableTransitions(wo.id);
    const back = avail.transitions.find((tr) => tr.toStatusCode === 0);
    if (!back) {
      window.alert(t('dispatch.cannotUnassign', { defaultValue: 'Ce BT ne peut pas être désassigné depuis son statut actuel.' }));
      return;
    }
    if (!window.confirm(t('dispatch.unassignConfirm', { defaultValue: `Retirer ${wo.referenceNumber} à son technicien ?`, ref: wo.referenceNumber }))) return;
    await workOrdersService.transitionDynamic(wo.id, { targetStepId: back.toStatusId });
    void qc.invalidateQueries({ queryKey: ['work-orders'] });
  }
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
    setTagIds([]);
    setPage(1);
    setActivePreset('');
  }

  function handlePageChange(next: number) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function applyPreset(name: string) {
    if (!name) {
      setActivePreset('');
      return;
    }
    const p = presets[name];
    if (!p) return;
    setSearch(p.search ?? '');
    setStatus(p.status);
    setType(p.type);
    setAssignedToId(p.assignedToId);
    setScheduledDateFrom(p.scheduledDateFrom ?? '');
    setScheduledDateTo(p.scheduledDateTo ?? '');
    setPriorityMin(p.priorityMin);
    setTagIds(p.tagIds ?? []);
    setPage(1);
    setActivePreset(name);
  }

  function handleSavePreset() {
    const name = window.prompt(
      t('list.presets.namePrompt', { defaultValue: 'Nom du filtre (ex: "Mes BT en cours") :' })
    )?.trim();
    if (!name) return;

    if (presets[name] && !window.confirm(
      t('list.presets.overwriteConfirm', {
        defaultValue: 'Un filtre porte déjà ce nom. L\'écraser ?',
      })
    )) {
      return;
    }

    const payload: FilterPreset = {
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...(scheduledDateFrom ? { scheduledDateFrom } : {}),
      ...(scheduledDateTo ? { scheduledDateTo } : {}),
      ...(priorityMin !== undefined && priorityMin > 0 ? { priorityMin } : {}),
      ...(tagIds.length > 0 ? { tagIds } : {}),
    };

    const next = { ...presets, [name]: payload };
    setPresets(next);
    persistPresets(next);
    setActivePreset(name);
  }

  function handleDeletePreset() {
    if (!activePreset) return;
    if (!window.confirm(
      t('list.presets.deleteConfirm', {
        defaultValue: 'Supprimer le filtre « {{name}} » ?',
        name: activePreset,
      })
    )) return;
    const next = { ...presets };
    delete next[activePreset];
    setPresets(next);
    persistPresets(next);
    setActivePreset('');
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
          {/* SLA breach toggle (B4) */}
          <button
            onClick={() => {
              setSlaBreachedOnly((prev) => {
                const next = !prev;
                localStorage.setItem(LS_SLA_BREACHED_KEY, String(next));
                return next;
              });
              setPage(1);
            }}
            title={slaBreachedOnly ? 'Afficher tous les BT' : 'N\'afficher que les BT en retard SLA'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.875rem',
              borderRadius: theme.radius.md,
              border: slaBreachedOnly
                ? `1px solid ${theme.colors.danger ?? '#dc2626'}`
                : theme.borders.default,
              background: slaBreachedOnly ? (theme.colors.dangerLight ?? '#fee2e2') : theme.colors.surface,
              color: slaBreachedOnly ? (theme.colors.danger ?? '#dc2626') : theme.colors.textSecondary,
              fontWeight: theme.font.weightMedium,
              fontSize: theme.font.sizeSm,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            ⚠ En retard
          </button>

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

      {/* ── Mode + période (B43 UI) ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ display: 'inline-flex', border: theme.borders.default, borderRadius: theme.radius.md, overflow: 'hidden' }}>
          {(['list', 'dispatch'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{ padding: '0.45rem 1rem', border: 'none', cursor: 'pointer', fontSize: theme.font.sizeSm, fontWeight: theme.font.weightMedium, background: mode === m ? theme.colors.primary : theme.colors.surface, color: mode === m ? '#fff' : theme.colors.textSecondary }}
            >
              {m === 'list' ? `☰ ${t('modes.list', { defaultValue: 'Liste' })}` : `🗂 ${t('modes.dispatch', { defaultValue: 'Dispatch' })}`}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', border: theme.borders.default, borderRadius: theme.radius.md, overflow: 'hidden' }}>
            {(['all', 'day', 'week', 'month'] as const).map((sc) => (
              <button
                key={sc}
                onClick={() => setScope(sc)}
                style={{ padding: '0.4rem 0.8rem', border: 'none', cursor: 'pointer', fontSize: theme.font.sizeSm, background: scope === sc ? theme.colors.primaryLight : theme.colors.surface, color: scope === sc ? theme.colors.primary : theme.colors.textSecondary, fontWeight: scope === sc ? theme.font.weightSemibold : theme.font.weightNormal }}
              >
                {t(`period.${sc}`, { defaultValue: sc })}
              </button>
            ))}
          </div>
          {scope !== 'all' && (
            <>
              <button onClick={() => { setAnchor((a) => shiftPeriod(scope, a, -1)); setPage(1); }} style={{ ...buttonStyles.secondary, padding: '0.35rem 0.6rem' }} title={t('period.prev', { defaultValue: 'Précédent' })}>‹</button>
              <button onClick={() => { setAnchor(new Date()); setPage(1); }} style={{ ...buttonStyles.secondary, padding: '0.35rem 0.75rem' }}>{t('period.today', { defaultValue: "Aujourd'hui" })}</button>
              <button onClick={() => { setAnchor((a) => shiftPeriod(scope, a, 1)); setPage(1); }} style={{ ...buttonStyles.secondary, padding: '0.35rem 0.6rem' }} title={t('period.next', { defaultValue: 'Suivant' })}>›</button>
              <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.text, fontWeight: theme.font.weightMedium, textTransform: 'capitalize' }}>{periodLabel(scope, anchor, tCommon('locale', { defaultValue: 'fr-CA' }))}</span>
            </>
          )}
          {mode === 'dispatch' && (
            <select value={dispatchSort} onChange={(e) => { const v = e.target.value as DispatchSort; localStorage.setItem('wo.dispatchSort', v); setDispatchSort(v); }} style={{ ...formStyles.select, width: 'auto' }}>
              <option value="time">{t('dispatch.sortTime', { defaultValue: 'Tri : heure' })}</option>
              <option value="priority">{t('dispatch.sortPriority', { defaultValue: 'Tri : priorité' })}</option>
              <option value="type">{t('dispatch.sortType', { defaultValue: 'Tri : type' })}</option>
              <option value="reference">{t('dispatch.sortReference', { defaultValue: 'Tri : référence' })}</option>
            </select>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <TechnicianPanel
          technicians={technicians}
          counts={panelCounts.counts}
          unassignedCount={panelCounts.unassigned}
          selectedId={assignedToId}
          onSelect={(id) => { setAssignedToId(id); setPage(1); }}
          onDropWorkOrder={setPendingDispatch}
        />
        <div style={{ flex: 1, minWidth: 0 }}>

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
        {/* Row 0 — saved filter presets */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: '0.75rem',
            paddingBottom: '0.75rem',
            borderBottom: theme.borders.light,
          }}
        >
          <span
            style={{
              fontSize: theme.font.sizeXs,
              color: theme.colors.textMuted,
              fontWeight: theme.font.weightMedium,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            ⭐ {t('list.presets.title', { defaultValue: 'Filtres enregistrés' })}
          </span>
          <select
            value={activePreset}
            onChange={(e) => applyPreset(e.target.value)}
            style={{ ...formStyles.select, flex: '0 1 240px', minWidth: '180px' }}
          >
            <option value="">
              {t('list.presets.none', { defaultValue: '— Aucun —' })}
            </option>
            {Object.keys(presets).sort().map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button
            onClick={handleSavePreset}
            disabled={activeCount === 0}
            title={activeCount === 0
              ? t('list.presets.saveTooltipEmpty', { defaultValue: 'Aucun filtre actif à enregistrer' })
              : t('list.presets.saveTooltip', { defaultValue: 'Enregistrer les filtres courants sous un nom' })}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: theme.radius.md,
              border: theme.borders.default,
              background: activeCount === 0 ? theme.colors.surfaceAlt : theme.colors.surface,
              color: activeCount === 0 ? theme.colors.textLight : theme.colors.textSecondary,
              fontWeight: theme.font.weightMedium,
              fontSize: theme.font.sizeSm,
              cursor: activeCount === 0 ? 'not-allowed' : 'pointer',
              opacity: activeCount === 0 ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            💾 {t('list.presets.save', { defaultValue: 'Enregistrer' })}
          </button>
          {activePreset && (
            <button
              onClick={handleDeletePreset}
              title={t('list.presets.deleteTooltip', { defaultValue: 'Supprimer ce filtre enregistré' })}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: theme.radius.md,
                border: '1px solid var(--c-dangerBadgeBorder)',
                background: theme.colors.dangerLight,
                color: theme.colors.danger,
                fontWeight: theme.font.weightMedium,
                fontSize: theme.font.sizeSm,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              🗑 {t('list.presets.delete', { defaultValue: 'Supprimer' })}
            </button>
          )}
        </div>

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

            {/* B44 — Tags (any of) */}
            <div style={{ flex: '0 0 auto' }}>
              <label style={{ display: 'block', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem', fontWeight: theme.font.weightMedium }}>
                {t('list.filterTags', { defaultValue: 'Tags' })}
              </label>
              <TagPicker
                variant="filter"
                value={tagIds}
                onChange={(next) => { setTagIds(next); setPage(1); }}
                placeholder={t('list.filterTags', { defaultValue: 'Tags' })}
              />
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

            {/* B42 — Mandaté par */}
            {principals.length > 0 && (
              <div style={{ flex: '0 1 180px', minWidth: '140px' }}>
                <label style={{ display: 'block', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, marginBottom: '0.25rem', fontWeight: theme.font.weightMedium }}>
                  🤝 {t('list.principalFilter', { defaultValue: 'Mandaté par' })}
                </label>
                <select
                  value={principalClientId ?? ''}
                  onChange={(e) => { setPrincipalClientId(e.target.value || undefined); setPage(1); }}
                  style={{ ...formStyles.select }}
                >
                  <option value="">{tCommon('labels.all')}</option>
                  {principals.map((c) => (
                    <option key={c.id} value={c.id}>{principalDisplayName(c)}</option>
                  ))}
                </select>
              </div>
            )}

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
                  <option key={p} value={p}>{priorityLabel(t, p)}</option>
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

          {mode === 'list' ? (
            <>
          {/* Drag hint + Column picker */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textLight }}>
              💡 {t('list.dragHint', { defaultValue: 'Glissez une ligne sur un technicien du panneau de gauche pour dispatcher. Cliquez la référence pour ouvrir le BT.' })}
            </span>
            <ColumnPicker
              catalog={columnCatalog as ColumnDef<unknown>[]}
              visible={visibleIds}
              onChange={setColumnsOrder}
            />
          </div>

          {/* Table */}
          <div style={{ ...tableStyles.container, overflowX: 'auto' }}>
            {/* Fixed layout : columns share the available width (weights below) and long text wraps, so nothing is cut off. */}
            <table style={{ width: '100%', minWidth: 0, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                {orderedColumns.map((col) => (
                  <col key={col.id} style={{ width: colWidths[col.id] }} />
                ))}
              </colgroup>
              <thead style={{ ...tableStyles.header }}>
                <tr>
                  {orderedColumns.map((col) => (
                    <th key={col.id} style={{ ...tableStyles.headerCell, textAlign: 'left', padding: '0.45rem 0.5rem', lineHeight: 1.2, whiteSpace: 'normal', overflow: 'hidden' }}>
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
                        <td
                          key={col.id}
                          style={{
                            ...(col.tdStyle ?? tableStyles.cell), padding: '0.35rem 0.5rem', fontSize: theme.font.sizeXs, lineHeight: 1.25, overflow: 'hidden',
                            // Reference and status chips stay on one line ; everything else wraps.
                            ...(col.id === 'referenceNumber' || col.id === 'status' || col.id === 'tags' ? { whiteSpace: 'nowrap', textOverflow: 'ellipsis' } : { whiteSpace: 'normal', overflowWrap: 'anywhere' }),
                          }}
                        >
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
          ) : (
            <DispatchBoard
              workOrders={items}
              technicians={technicians}
              sort={dispatchSort}
              onOpen={handleOpen}
              onAssign={setPendingDispatch}
              onUnassign={(wo) => void handleUnassign(wo)}
            />
          )}
        </>
      )}
        </div>
      </div>

      {openId && <WorkOrderModal workOrderId={openId} onClose={() => setOpenId(null)} />}
      {pendingDispatch && <DispatchConfirmModal payload={pendingDispatch} onClose={() => setPendingDispatch(null)} />}
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
