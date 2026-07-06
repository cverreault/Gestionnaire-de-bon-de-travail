import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useProcesses,
  useProcess,
  useCreateProcess,
  useUpdateProcess,
  useDeleteProcess,
  useAddProcessStatus,
  useUpdateProcessStatus,
  useDeleteProcessStatus,
  useAddProcessTransition,
  useDeleteProcessTransition,
} from '../hooks/useProcess';
import type {
  ProcessDefinition,
  ProcessStatus,
  ProcessTransitionDef,
} from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  theme,
  cardStyles,
  buttonStyles,
  formStyles,
  modalStyles,
  tableStyles,
  layoutStyles,
  badgeStyles,
  getRowStyle,
} from '../theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '').padEnd(6, '0');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return { r, g, b };
}

function contrastText(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#1e293b' : '#ffffff';
}

const ROLE_OPTIONS = ['ADMIN', 'DISPATCHER', 'TECHNICIAN'];
const REQUIRED_FIELD_OPTIONS = [
  'assignedToId',
  'negativeReason',
  'completionNotes',
  'reopenReason',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Small inline color badge for a process status */
function StatusChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      style={{
        ...badgeStyles.base,
        background: color + '20',
        color: color,
        border: `1px solid ${color}40`,
        fontSize: theme.font.sizeXs,
        padding: '0.1rem 0.5rem',
        fontWeight: theme.font.weightSemibold,
      }}
    >
      {name}
    </span>
  );
}

/** ── Tab bar ──────────────────────────────────────────────────────────────── */
function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: number;
  onChange: (i: number) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        borderBottom: theme.borders.default,
        marginBottom: '1.5rem',
        gap: 0,
      }}
    >
      {tabs.map((label, i) => (
        <button
          key={label}
          onClick={() => onChange(i)}
          style={{
            padding: '0.625rem 1.25rem',
            border: 'none',
            borderBottom: active === i ? `2px solid ${theme.colors.primary}` : '2px solid transparent',
            background: 'none',
            color: active === i ? theme.colors.primary : theme.colors.textMuted,
            fontWeight: active === i ? theme.font.weightSemibold : theme.font.weightNormal,
            fontSize: theme.font.sizeSm,
            cursor: 'pointer',
            marginBottom: '-1px',
            transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Process list ─────────────────────────────────────────────────────────────

function ProcessList({
  onSelect,
  onEdit,
}: {
  onSelect: (id: string) => void;
  onEdit: (proc: ProcessDefinition) => void;
}) {
  const { data, isLoading, isError } = useProcesses();
  const createProcess = useCreateProcess();
  const updateProcess = useUpdateProcess();
  const deleteProcess = useDeleteProcess();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const allProcesses: ProcessDefinition[] = data?.data ?? [];
  const processes = showInactive ? allProcesses : allProcesses.filter((p) => p.isActive);
  const inactiveCount = allProcesses.filter((p) => !p.isActive).length;

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  }

  async function handleDelete(proc: ProcessDefinition) {
    try {
      await deleteProcess.mutateAsync(proc.id);
      setDeleteConfirmId(null);
      showToast(`✓ « ${proc.name} » supprimé`, 'success');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const msg = axiosErr?.response?.data?.message ?? 'Impossible de supprimer ce processus.';
      setDeleteConfirmId(null);
      showToast(`❌ ${msg}`, 'error');
    }
  }

  async function handleReactivate(proc: ProcessDefinition) {
    try {
      await updateProcess.mutateAsync({ id: proc.id, data: { isActive: true } });
      showToast(`✓ « ${proc.name} » réactivé`, 'success');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      const msg = axiosErr?.response?.data?.message ?? 'Impossible de réactiver ce processus.';
      showToast(`❌ ${msg}`, 'error');
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreateError(null);
    try {
      await createProcess.mutateAsync({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        isDefault: newIsDefault,
      });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setNewIsDefault(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setCreateError(
        axiosErr?.response?.data?.message ??
          'Impossible de créer le processus. Vérifiez que le nom n\'est pas déjà utilisé.',
      );
    }
  }

  async function handleDuplicate(proc: ProcessDefinition) {
    await createProcess.mutateAsync({
      name: `Copie de ${proc.name}`,
      description: proc.description || undefined,
      isDefault: false,
    });
  }

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <p style={{ color: theme.colors.danger }}>Erreur lors du chargement.</p>;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: theme.font.sizeXl, fontWeight: theme.font.weightBold, color: theme.colors.text }}>
            ⚙️ Processus configurés
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
            Cliquez sur un processus pour configurer ses étapes et transitions.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {inactiveCount > 0 && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: theme.font.sizeSm, color: theme.colors.textMuted, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                style={{ width: '0.9rem', height: '0.9rem', accentColor: theme.colors.primary }}
              />
              Afficher les inactifs ({inactiveCount})
            </label>
          )}
          <button onClick={() => setShowCreate(true)} style={{ ...buttonStyles.primary }}>
            + Nouveau processus
          </button>
        </div>
      </div>

      {/* Toast (floating, success or error) */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: toast.type === 'error' ? '#991b1b' : '#15803d',
            color: '#fff',
            padding: '0.875rem 1.5rem',
            borderRadius: theme.radius.lg,
            boxShadow: theme.shadows.xl,
            zIndex: theme.zIndex.toast,
            fontSize: theme.font.sizeSm,
            fontWeight: theme.font.weightMedium,
            maxWidth: '90vw',
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div
          style={{
            background: theme.colors.surface,
            border: theme.borders.default,
            borderRadius: theme.radius.lg,
            padding: '1.25rem',
            marginBottom: '1.25rem',
            boxShadow: theme.shadows.sm,
          }}
        >
          <h3 style={{ margin: '0 0 1rem', fontSize: theme.font.sizeMd, color: theme.colors.text }}>
            Nouveau processus
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ ...formStyles.label }}>Nom <span style={{ color: theme.colors.danger }}>*</span></label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ ...formStyles.input, boxSizing: 'border-box' }}
                placeholder="Ex: Processus standard"
              />
            </div>
            <div>
              <label style={{ ...formStyles.label }}>Description</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                style={{ ...formStyles.input, boxSizing: 'border-box' }}
                placeholder="Description optionnelle"
              />
            </div>
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: theme.font.sizeSm,
              color: theme.colors.text,
              cursor: 'pointer',
              marginBottom: '1rem',
            }}
          >
            <input
              type="checkbox"
              checked={newIsDefault}
              onChange={(e) => setNewIsDefault(e.target.checked)}
              style={{ width: '1rem', height: '1rem', accentColor: theme.colors.primary }}
            />
            Définir comme processus par défaut
          </label>
          {createError && (
            <div
              style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#991b1b',
                padding: '0.625rem 0.875rem',
                borderRadius: theme.radius.md,
                marginBottom: '0.75rem',
                fontSize: theme.font.sizeSm,
              }}
            >
              {createError}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createProcess.isPending}
              style={{
                ...buttonStyles.primary,
                opacity: (!newName.trim() || createProcess.isPending) ? 0.6 : 1,
                cursor: (!newName.trim() || createProcess.isPending) ? 'not-allowed' : 'pointer',
              }}
            >
              {createProcess.isPending ? 'Création...' : '✓ Créer'}
            </button>
            <button onClick={() => { setShowCreate(false); setCreateError(null); }} style={{ ...buttonStyles.secondary }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Process table */}
      {processes.length === 0 ? (
        <div style={{ ...layoutStyles.emptyState }}>
          <span style={{ fontSize: '2.5rem' }}>⚙️</span>
          <p style={{ margin: 0 }}>Aucun processus configuré. Créez-en un pour commencer.</p>
        </div>
      ) : (
        <div
          style={{
            background: theme.colors.surface,
            border: theme.borders.default,
            borderRadius: theme.radius.lg,
            overflow: 'hidden',
            boxShadow: theme.shadows.sm,
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ ...tableStyles.header }}>
              <tr>
                {['Nom', 'Description', 'Étapes', 'Transitions', 'Défaut', 'Actif', ''].map((h) => (
                  <th key={h} style={{ ...tableStyles.headerCell, textAlign: 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {processes.map((proc, index) => (
                <tr
                  key={proc.id}
                  style={getRowStyle(index, hoveredRow === index)}
                  onMouseEnter={() => setHoveredRow(index)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td style={{ ...tableStyles.cell, fontWeight: theme.font.weightSemibold }}>
                    <button
                      onClick={() => onSelect(proc.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: theme.colors.primary,
                        fontWeight: theme.font.weightSemibold,
                        fontSize: theme.font.sizeSm,
                        textDecoration: 'underline',
                        padding: 0,
                      }}
                    >
                      {proc.name}
                    </button>
                  </td>
                  <td style={{ ...tableStyles.cellMuted, maxWidth: '200px' }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {proc.description || <span style={{ color: theme.colors.textLight }}>—</span>}
                    </span>
                  </td>
                  <td style={{ ...tableStyles.cell, textAlign: 'center' }}>
                    <span
                      style={{
                        ...badgeStyles.base,
                        ...badgeStyles.info,
                        fontSize: '0.7rem',
                      }}
                    >
                      {proc._count?.statuses ?? (proc.statuses?.length ?? '—')}
                    </span>
                  </td>
                  <td style={{ ...tableStyles.cell, textAlign: 'center' }}>
                    <span
                      style={{
                        ...badgeStyles.base,
                        ...badgeStyles.neutral,
                        fontSize: '0.7rem',
                      }}
                    >
                      {proc._count?.transitions ?? (proc.transitions?.length ?? '—')}
                    </span>
                  </td>
                  <td style={{ ...tableStyles.cell }}>
                    {proc.isDefault ? (
                      <span style={{ ...badgeStyles.base, ...badgeStyles.success, fontSize: '0.7rem' }}>✓ Défaut</span>
                    ) : (
                      <span style={{ color: theme.colors.textLight, fontSize: theme.font.sizeXs }}>—</span>
                    )}
                  </td>
                  <td style={{ ...tableStyles.cell }}>
                    <button
                      onClick={() =>
                        updateProcess.mutate({ id: proc.id, data: { isActive: !proc.isActive } })
                      }
                      disabled={updateProcess.isPending}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.2rem 0.6rem',
                        borderRadius: theme.radius.full,
                        border: 'none',
                        fontSize: theme.font.sizeXs,
                        fontWeight: theme.font.weightSemibold,
                        cursor: 'pointer',
                        background: proc.isActive ? theme.colors.successLight : theme.colors.dangerLight,
                        color: proc.isActive ? '#065f46' : '#991b1b',
                      }}
                    >
                      {proc.isActive ? '✓ Actif' : '✗ Inactif'}
                    </button>
                  </td>
                  <td style={{ ...tableStyles.cell, whiteSpace: 'nowrap' }}>
                    {deleteConfirmId === proc.id ? (
                      <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.danger, fontWeight: theme.font.weightMedium }}>
                          Confirmer ?
                        </span>
                        <button
                          onClick={() => handleDelete(proc)}
                          disabled={deleteProcess.isPending}
                          style={{ ...buttonStyles.danger, ...buttonStyles.sm }}
                        >
                          Oui
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
                        >
                          Non
                        </button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => onEdit(proc)}
                          style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
                        >
                          ✏️ Modifier
                        </button>
                        <button
                          onClick={() => handleDuplicate(proc)}
                          disabled={createProcess.isPending}
                          style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
                          title="Créer un nouveau processus basé sur celui-ci. Seules les informations de base seront copiées — les étapes et transitions devront être configurées manuellement."
                        >
                          📋 Créer basé sur...
                        </button>
                        {proc.isActive ? (
                          <button
                            onClick={() => setDeleteConfirmId(proc.id)}
                            title="Supprimer (désactiver) ce processus"
                            style={{
                              ...buttonStyles.sm,
                              background: 'none',
                              border: `1px solid ${theme.colors.danger}40`,
                              color: theme.colors.danger,
                              padding: '0.25rem 0.625rem',
                              borderRadius: theme.radius.sm,
                              cursor: 'pointer',
                              fontSize: theme.font.sizeXs,
                            }}
                          >
                            🗑 Supprimer
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(proc)}
                            disabled={updateProcess.isPending}
                            title="Réactiver ce processus"
                            style={{
                              ...buttonStyles.sm,
                              background: 'none',
                              border: `1px solid ${theme.colors.success}60`,
                              color: theme.colors.success,
                              padding: '0.25rem 0.625rem',
                              borderRadius: theme.radius.sm,
                              cursor: 'pointer',
                              fontSize: theme.font.sizeXs,
                            }}
                          >
                            ♻️ Réactiver
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Process editor (tabs: Identity / Statuses / Transitions) ─────────────────

function ProcessEditor({
  processId,
  onBack,
}: {
  processId: string;
  onBack: () => void;
}) {
  const { data: proc, isLoading, isError } = useProcess(processId);
  const updateProcess = useUpdateProcess();
  const addStatus = useAddProcessStatus();
  const updateStatus = useUpdateProcessStatus();
  const deleteStatus = useDeleteProcessStatus();
  const addTransition = useAddProcessTransition();
  const deleteTransition = useDeleteProcessTransition();

  const [activeTab, setActiveTab] = useState(0);

  // ── Identity form ─────────────────────────────────────────────────────────
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [identityDirty, setIdentityDirty] = useState(false);

  // Populate form fields when the process loads or its identity changes
  useEffect(() => {
    if (proc) {
      setEditName(proc.name);
      setEditDesc(proc.description ?? '');
      setEditIsDefault(proc.isDefault);
    }
  }, [proc?.id]);

  async function handleSaveIdentity() {
    await updateProcess.mutateAsync({
      id: processId,
      data: {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
        isDefault: editIsDefault,
      },
    });
    setIdentityDirty(false);
  }

  // ── Add status form ───────────────────────────────────────────────────────
  const [showAddStatus, setShowAddStatus] = useState(false);
  const [nsCode, setNsCode] = useState('');
  const [nsName, setNsName] = useState('');
  const [nsNameEn, setNsNameEn] = useState('');
  const [nsColor, setNsColor] = useState('#6366f1');
  const [nsPosition, setNsPosition] = useState('0');
  const [nsIsInitial, setNsIsInitial] = useState(false);
  const [nsIsDispatch, setNsIsDispatch] = useState(false);
  const [nsIsStart, setNsIsStart] = useState(false);
  const [nsIsTerminalPos, setNsIsTerminalPos] = useState(false);
  const [nsIsTerminalNeg, setNsIsTerminalNeg] = useState(false);

  async function handleAddStatus() {
    const fr = nsName.trim();
    const en = nsNameEn.trim();
    if ((!fr && !en) || !nsCode.trim()) return;
    await addStatus.mutateAsync({
      processId,
      data: {
        code: parseInt(nsCode, 10),
        name: fr || en,
        nameFr: fr,
        nameEn: en,
        color: nsColor,
        position: parseInt(nsPosition, 10) || 0,
        isInitial: nsIsInitial,
        isDispatch: nsIsDispatch,
        isStart: nsIsStart,
        isTerminalPositive: nsIsTerminalPos,
        isTerminalNegative: nsIsTerminalNeg,
      },
    });
    setShowAddStatus(false);
    setNsCode(''); setNsName(''); setNsNameEn(''); setNsColor('#6366f1'); setNsPosition('0');
    setNsIsInitial(false); setNsIsDispatch(false); setNsIsStart(false);
    setNsIsTerminalPos(false); setNsIsTerminalNeg(false);
  }

  // ── Add transition form ───────────────────────────────────────────────────
  const [showAddTransition, setShowAddTransition] = useState(false);
  const [ntFromId, setNtFromId] = useState('');
  const [ntToId, setNtToId] = useState('');
  const [ntLabel, setNtLabel] = useState('');
  const [ntLabelEn, setNtLabelEn] = useState('');
  const [ntRoles, setNtRoles] = useState<string[]>([]);
  const [ntFields, setNtFields] = useState<string[]>([]);
  const [ntSortOrder, setNtSortOrder] = useState('0');

  function toggleArrayValue<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
  }

  async function handleAddTransition() {
    const fr = ntLabel.trim();
    const en = ntLabelEn.trim();
    if (!ntFromId || !ntToId || (!fr && !en)) return;
    await addTransition.mutateAsync({
      processId,
      data: {
        fromStatusId: ntFromId,
        toStatusId: ntToId,
        label: fr || en,
        labelFr: fr,
        labelEn: en,
        allowedRoles: ntRoles,
        requiredFields: ntFields,
        sortOrder: parseInt(ntSortOrder, 10) || 0,
      },
    });
    setShowAddTransition(false);
    setNtFromId(''); setNtToId(''); setNtLabel(''); setNtLabelEn('');
    setNtRoles([]); setNtFields([]); setNtSortOrder('0');
  }

  // ── Loading / error ───────────────────────────────────────────────────────
  if (isLoading) return <LoadingSpinner />;
  if (isError || !proc)
    return <p style={{ color: theme.colors.danger }}>Erreur lors du chargement du processus.</p>;

  const statuses: ProcessStatus[] = proc.statuses ?? [];
  const transitions: ProcessTransitionDef[] = proc.transitions ?? [];

  const cardStyle: React.CSSProperties = {
    ...cardStyles.card,
    padding: '1.5rem',
    marginBottom: '1.5rem',
  };

  return (
    <div>
      {/* Back */}
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          color: theme.colors.primary,
          cursor: 'pointer',
          marginBottom: '1rem',
          fontSize: theme.font.sizeSm,
        }}
      >
        ← Retour à la liste
      </button>

      {/* Process title */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2
          style={{
            margin: 0,
            fontSize: theme.font.sizeXl,
            fontWeight: theme.font.weightBold,
            color: theme.colors.text,
          }}
        >
          {proc.name}
        </h2>
        <p style={{ margin: '0.25rem 0 0', fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
          Version {proc.version} ·{' '}
          {proc.isActive ? (
            <span style={{ color: theme.colors.success }}>Actif</span>
          ) : (
            <span style={{ color: theme.colors.danger }}>Inactif</span>
          )}
          {proc.isDefault && (
            <span style={{ marginLeft: '0.5rem', ...badgeStyles.base, ...badgeStyles.info, fontSize: '0.7rem' }}>
              Défaut
            </span>
          )}
        </p>
      </div>

      {/* Tabs */}
      <TabBar
        tabs={['🪪 Identité', `📋 Étapes (${statuses.length})`, `🔀 Transitions (${transitions.length})`]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* ── TAB 0 : Identité ────────────────────────────────────────────────── */}
      {activeTab === 0 && (
        <div style={cardStyle}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ ...formStyles.label }}>
              Nom <span style={{ color: theme.colors.danger }}>*</span>
            </label>
            <input
              value={editName}
              onChange={(e) => { setEditName(e.target.value); setIdentityDirty(true); }}
              style={{ ...formStyles.input, boxSizing: 'border-box', maxWidth: '480px' }}
            />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ ...formStyles.label }}>Description</label>
            <textarea
              value={editDesc}
              onChange={(e) => { setEditDesc(e.target.value); setIdentityDirty(true); }}
              rows={3}
              style={{ ...formStyles.textarea, boxSizing: 'border-box', maxWidth: '480px' }}
            />
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: theme.font.sizeSm,
              color: theme.colors.text,
              cursor: 'pointer',
              marginBottom: '1.25rem',
            }}
          >
            <input
              type="checkbox"
              checked={editIsDefault}
              onChange={(e) => { setEditIsDefault(e.target.checked); setIdentityDirty(true); }}
              style={{ width: '1rem', height: '1rem', accentColor: theme.colors.primary }}
            />
            Processus par défaut (appliqué aux nouveaux bons de travail)
          </label>
          <button
            onClick={handleSaveIdentity}
            disabled={!editName.trim() || updateProcess.isPending || !identityDirty}
            style={{
              ...buttonStyles.primary,
              opacity: (!editName.trim() || updateProcess.isPending || !identityDirty) ? 0.6 : 1,
              cursor: (!editName.trim() || updateProcess.isPending || !identityDirty) ? 'not-allowed' : 'pointer',
            }}
          >
            {updateProcess.isPending ? 'Sauvegarde...' : '✓ Enregistrer'}
          </button>
          {updateProcess.isError && (
            <p style={{ color: theme.colors.danger, fontSize: theme.font.sizeXs, marginTop: '0.5rem' }}>
              Erreur lors de la sauvegarde.
            </p>
          )}
        </div>
      )}

      {/* ── TAB 1 : Étapes ──────────────────────────────────────────────────── */}
      {activeTab === 1 && (
        <div>
          {/* Add status button */}
          <div style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => setShowAddStatus(true)}
              style={{ ...buttonStyles.primary }}
            >
              + Ajouter une étape
            </button>
          </div>

          {/* Add status form */}
          {showAddStatus && (
            <div style={{ ...cardStyle }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: theme.font.sizeMd, color: theme.colors.text }}>
                Nouvelle étape
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '0.75rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div>
                  <label style={{ ...formStyles.label }}>Code (int) *</label>
                  <input
                    type="number"
                    value={nsCode}
                    onChange={(e) => setNsCode(e.target.value)}
                    style={{ ...formStyles.input, boxSizing: 'border-box' }}
                    placeholder="Ex: 10"
                  />
                </div>
                <div>
                  <label style={{ ...formStyles.label }}>Nom FR *</label>
                  <input
                    value={nsName}
                    onChange={(e) => setNsName(e.target.value)}
                    style={{ ...formStyles.input, boxSizing: 'border-box' }}
                    placeholder="Ex: Créé"
                  />
                </div>
                <div>
                  <label style={{ ...formStyles.label }}>Nom EN</label>
                  <input
                    value={nsNameEn}
                    onChange={(e) => setNsNameEn(e.target.value)}
                    style={{ ...formStyles.input, boxSizing: 'border-box' }}
                    placeholder="E.g. Created"
                  />
                </div>
                <div>
                  <label style={{ ...formStyles.label }}>Position</label>
                  <input
                    type="number"
                    value={nsPosition}
                    onChange={(e) => setNsPosition(e.target.value)}
                    style={{ ...formStyles.input, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              {/* Color */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ ...formStyles.label }}>Couleur</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="color"
                    value={nsColor}
                    onChange={(e) => setNsColor(e.target.value)}
                    style={{ width: '3rem', height: '2.25rem', border: theme.borders.default, borderRadius: theme.radius.md, cursor: 'pointer', padding: '0.125rem' }}
                  />
                  <input
                    value={nsColor}
                    onChange={(e) => setNsColor(e.target.value)}
                    style={{ ...formStyles.input, fontFamily: 'monospace', maxWidth: '120px', boxSizing: 'border-box' }}
                    placeholder="#6366f1"
                  />
                  <span
                    style={{
                      width: '2rem',
                      height: '2rem',
                      borderRadius: theme.radius.full,
                      background: nsColor,
                      border: theme.borders.default,
                      display: 'inline-block',
                    }}
                  />
                  {nsName && (
                    <StatusChip name={nsName} color={nsColor} />
                  )}
                </div>
              </div>
              {/* Flags */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  marginBottom: '1rem',
                }}
              >
                {[
                  { label: 'Initial', val: nsIsInitial, set: setNsIsInitial },
                  { label: 'Dispatch', val: nsIsDispatch, set: setNsIsDispatch },
                  { label: 'Démarrage', val: nsIsStart, set: setNsIsStart },
                  { label: 'Terminal positif', val: nsIsTerminalPos, set: setNsIsTerminalPos },
                  { label: 'Terminal négatif', val: nsIsTerminalNeg, set: setNsIsTerminalNeg },
                ].map(({ label, val, set }) => (
                  <label
                    key={label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      fontSize: theme.font.sizeSm,
                      color: theme.colors.text,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={val}
                      onChange={(e) => set(e.target.checked)}
                      style={{ width: '1rem', height: '1rem', accentColor: theme.colors.primary }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleAddStatus}
                  disabled={(!nsName.trim() && !nsNameEn.trim()) || !nsCode.trim() || addStatus.isPending}
                  style={{
                    ...buttonStyles.primary,
                    opacity: (!nsName.trim() || !nsCode.trim() || addStatus.isPending) ? 0.6 : 1,
                    cursor: (!nsName.trim() || !nsCode.trim() || addStatus.isPending) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {addStatus.isPending ? 'Ajout...' : '✓ Ajouter'}
                </button>
                <button onClick={() => setShowAddStatus(false)} style={{ ...buttonStyles.secondary }}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Status list */}
          {statuses.length === 0 ? (
            <div style={{ ...layoutStyles.emptyState }}>
              <span style={{ fontSize: '2rem' }}>📋</span>
              <p style={{ margin: 0 }}>Aucune étape. Ajoutez-en une pour commencer.</p>
            </div>
          ) : (
            <div
              style={{
                background: theme.colors.surface,
                border: theme.borders.default,
                borderRadius: theme.radius.lg,
                overflow: 'hidden',
                boxShadow: theme.shadows.sm,
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ ...tableStyles.header }}>
                  <tr>
                    {['Couleur', 'Code', 'Nom', 'Pos.', 'Flags', ''].map((h) => (
                      <th key={h} style={{ ...tableStyles.headerCell, textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...statuses]
                    .sort((a, b) => a.position - b.position)
                    .map((s, index) => (
                      <StatusRow
                        key={s.id}
                        status={s}
                        index={index}
                        processId={processId}
                        onUpdate={(sid, data) =>
                          updateStatus.mutate({ processId, statusId: sid, data })
                        }
                        onDelete={(sid) =>
                          deleteStatus.mutate({ processId, statusId: sid })
                        }
                        isUpdating={updateStatus.isPending}
                        isDeleting={deleteStatus.isPending}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2 : Transitions ─────────────────────────────────────────────── */}
      {activeTab === 2 && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => setShowAddTransition(true)}
              style={{ ...buttonStyles.primary }}
            >
              + Ajouter une transition
            </button>
          </div>

          {/* Add transition form */}
          {showAddTransition && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 1rem', fontSize: theme.font.sizeMd, color: theme.colors.text }}>
                Nouvelle transition
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '0.75rem',
                  marginBottom: '0.75rem',
                }}
              >
                {/* From */}
                <div>
                  <label style={{ ...formStyles.label }}>De (étape source) *</label>
                  <select
                    value={ntFromId}
                    onChange={(e) => setNtFromId(e.target.value)}
                    style={{ ...formStyles.select, boxSizing: 'border-box' }}
                  >
                    <option value="">— Choisir —</option>
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                {/* To */}
                <div>
                  <label style={{ ...formStyles.label }}>Vers (étape cible) *</label>
                  <select
                    value={ntToId}
                    onChange={(e) => setNtToId(e.target.value)}
                    style={{ ...formStyles.select, boxSizing: 'border-box' }}
                  >
                    <option value="">— Choisir —</option>
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                {/* Label — bilingual (B10.2) */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ ...formStyles.label }}>Label de la transition *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input
                      value={ntLabel}
                      onChange={(e) => setNtLabel(e.target.value)}
                      style={{ ...formStyles.input, boxSizing: 'border-box' }}
                      placeholder="FR → Assigner"
                    />
                    <input
                      value={ntLabelEn}
                      onChange={(e) => setNtLabelEn(e.target.value)}
                      style={{ ...formStyles.input, boxSizing: 'border-box' }}
                      placeholder="EN → Assign"
                    />
                  </div>
                </div>
              </div>

              {/* Roles + Required fields */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                  marginBottom: '0.75rem',
                }}
              >
                {/* Roles */}
                <div>
                  <label style={{ ...formStyles.label }}>
                    Rôles autorisés <span style={{ color: theme.colors.danger }}>*</span>
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                    {ROLE_OPTIONS.map((role) => (
                      <label
                        key={role}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          fontSize: theme.font.sizeSm,
                          cursor: 'pointer',
                          padding: '0.25rem 0.625rem',
                          borderRadius: theme.radius.full,
                          background: ntRoles.includes(role) ? theme.colors.primaryLight : theme.colors.surfaceAlt,
                          border: `1px solid ${ntRoles.includes(role) ? theme.colors.primary : theme.colors.border}`,
                          color: ntRoles.includes(role) ? theme.colors.primary : theme.colors.text,
                          transition: 'all 0.15s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={ntRoles.includes(role)}
                          onChange={() => setNtRoles((prev) => toggleArrayValue(prev, role))}
                          style={{ display: 'none' }}
                        />
                        {role}
                      </label>
                    ))}
                  </div>
                  {ntRoles.length === 0 && (
                    <p style={{ margin: '0.25rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.danger }}>
                      Au moins un rôle doit être sélectionné.
                    </p>
                  )}
                </div>

                {/* Required fields */}
                <div>
                  <label style={{ ...formStyles.label }}>Champs requis</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                    {REQUIRED_FIELD_OPTIONS.map((field) => (
                      <label
                        key={field}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          fontSize: theme.font.sizeSm,
                          cursor: 'pointer',
                          padding: '0.25rem 0.625rem',
                          borderRadius: theme.radius.full,
                          background: ntFields.includes(field) ? '#fef3c7' : theme.colors.surfaceAlt,
                          border: `1px solid ${ntFields.includes(field) ? '#f59e0b' : theme.colors.border}`,
                          color: ntFields.includes(field) ? '#92400e' : theme.colors.text,
                          transition: 'all 0.15s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={ntFields.includes(field)}
                          onChange={() => setNtFields((prev) => toggleArrayValue(prev, field))}
                          style={{ display: 'none' }}
                        />
                        {field}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sort order */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ ...formStyles.label }}>Ordre de tri</label>
                <input
                  type="number"
                  value={ntSortOrder}
                  onChange={(e) => setNtSortOrder(e.target.value)}
                  style={{ ...formStyles.input, boxSizing: 'border-box', maxWidth: '100px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleAddTransition}
                  disabled={!ntFromId || !ntToId || (!ntLabel.trim() && !ntLabelEn.trim()) || ntRoles.length === 0 || addTransition.isPending}
                  style={{
                    ...buttonStyles.primary,
                    opacity: (!ntFromId || !ntToId || (!ntLabel.trim() && !ntLabelEn.trim()) || ntRoles.length === 0 || addTransition.isPending) ? 0.6 : 1,
                    cursor: (!ntFromId || !ntToId || (!ntLabel.trim() && !ntLabelEn.trim()) || ntRoles.length === 0 || addTransition.isPending) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {addTransition.isPending ? 'Ajout...' : '✓ Ajouter'}
                </button>
                <button onClick={() => setShowAddTransition(false)} style={{ ...buttonStyles.secondary }}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Transitions list */}
          {transitions.length === 0 ? (
            <div style={{ ...layoutStyles.emptyState }}>
              <span style={{ fontSize: '2rem' }}>🔀</span>
              <p style={{ margin: 0 }}>Aucune transition. Ajoutez-en une pour commencer.</p>
            </div>
          ) : (
            <div
              style={{
                background: theme.colors.surface,
                border: theme.borders.default,
                borderRadius: theme.radius.lg,
                overflow: 'hidden',
                boxShadow: theme.shadows.sm,
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ ...tableStyles.header }}>
                  <tr>
                    {['De', '', 'Vers', 'Label', 'Rôles', 'Champs requis', 'Tri', ''].map((h) => (
                      <th key={h} style={{ ...tableStyles.headerCell, textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...transitions]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((t, index) => (
                      <TransitionRow
                        key={t.id}
                        transition={t}
                        index={index}
                        onDelete={() =>
                          deleteTransition.mutate({ processId, transitionId: t.id })
                        }
                        isDeleting={deleteTransition.isPending}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── StatusRow — editable inline row ─────────────────────────────────────────

function StatusRow({
  status,
  index,
  onUpdate,
  onDelete,
  isUpdating,
  isDeleting,
}: {
  status: ProcessStatus;
  index: number;
  processId: string;
  onUpdate: (id: string, data: Partial<ProcessStatus>) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
  isDeleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [eName, setEName] = useState(status.nameFr ?? status.name);
  const [eNameEn, setENameEn] = useState(status.nameEn ?? status.name);
  const [eColor, setEColor] = useState(status.color);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [hoveredRow, setHoveredRow] = useState(false);

  function handleSave() {
    const fr = eName.trim();
    const en = eNameEn.trim();
    if (!fr && !en) return;
    onUpdate(status.id, {
      name: fr || en,
      nameFr: fr,
      nameEn: en,
      color: eColor,
    });
    setEditing(false);
  }

  const bgStyle = getRowStyle(index, hoveredRow);

  if (editing) {
    return (
      <tr style={bgStyle}>
        <td style={{ ...tableStyles.cell, width: '56px' }}>
          <input
            type="color"
            value={eColor}
            onChange={(e) => setEColor(e.target.value)}
            style={{ width: '2.5rem', height: '2rem', border: 'none', cursor: 'pointer', background: 'none' }}
          />
        </td>
        <td style={{ ...tableStyles.cell, fontFamily: 'monospace' }}>
          {status.code}
        </td>
        <td style={{ ...tableStyles.cell }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <input
              value={eName}
              onChange={(e) => setEName(e.target.value)}
              placeholder="FR"
              style={{ ...formStyles.input, boxSizing: 'border-box', maxWidth: '180px', padding: '0.2rem 0.4rem', fontSize: theme.font.sizeXs }}
            />
            <input
              value={eNameEn}
              onChange={(e) => setENameEn(e.target.value)}
              placeholder="EN"
              style={{ ...formStyles.input, boxSizing: 'border-box', maxWidth: '180px', padding: '0.2rem 0.4rem', fontSize: theme.font.sizeXs }}
            />
          </div>
        </td>
        <td style={{ ...tableStyles.cell, textAlign: 'center' }}>{status.position}</td>
        <td style={{ ...tableStyles.cell }}>
          <FlagsChips status={status} />
        </td>
        <td style={{ ...tableStyles.cell, whiteSpace: 'nowrap' }}>
          <span style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleSave}
              disabled={isUpdating}
              style={{ ...buttonStyles.primary, ...buttonStyles.sm }}
            >
              ✓
            </button>
            <button
              onClick={() => { setEditing(false); setEName(status.nameFr ?? status.name); setENameEn(status.nameEn ?? status.name); setEColor(status.color); }}
              style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
            >
              ✕
            </button>
          </span>
        </td>
      </tr>
    );
  }

  return (
    <tr
      style={bgStyle}
      onMouseEnter={() => setHoveredRow(true)}
      onMouseLeave={() => setHoveredRow(false)}
    >
      <td style={{ ...tableStyles.cell, width: '56px' }}>
        <span
          style={{
            display: 'inline-block',
            width: '1.25rem',
            height: '1.25rem',
            borderRadius: theme.radius.full,
            background: status.color,
            border: theme.borders.light,
            verticalAlign: 'middle',
          }}
        />
      </td>
      <td style={{ ...tableStyles.cell, fontFamily: 'monospace', fontSize: theme.font.sizeXs }}>
        {status.code}
      </td>
      <td style={{ ...tableStyles.cell }}>
        <StatusChip name={status.name} color={status.color} />
      </td>
      <td style={{ ...tableStyles.cell, textAlign: 'center', color: theme.colors.textMuted, fontSize: theme.font.sizeXs }}>
        {status.position}
      </td>
      <td style={{ ...tableStyles.cell }}>
        <FlagsChips status={status} />
      </td>
      <td style={{ ...tableStyles.cell, whiteSpace: 'nowrap' }}>
        {deleteConfirm ? (
          <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.danger, fontWeight: theme.font.weightMedium }}>
              Confirmer ?
            </span>
            <button
              onClick={() => { onDelete(status.id); setDeleteConfirm(false); }}
              disabled={isDeleting}
              style={{ ...buttonStyles.danger, ...buttonStyles.sm }}
            >
              Oui
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
            >
              Non
            </button>
          </span>
        ) : (
          <span style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setEditing(true)} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>
              ✏️
            </button>
            <button
              onClick={() => setDeleteConfirm(true)}
              style={{
                ...buttonStyles.sm,
                background: 'none',
                border: `1px solid ${theme.colors.danger}40`,
                color: theme.colors.danger,
                padding: '0.25rem 0.625rem',
                borderRadius: theme.radius.sm,
                cursor: 'pointer',
                fontSize: theme.font.sizeXs,
              }}
            >
              🗑
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

/** Inline flags pills */
function FlagsChips({ status }: { status: ProcessStatus }) {
  const flags: string[] = [];
  if (status.isInitial) flags.push('Initial');
  if (status.isDispatch) flags.push('Dispatch');
  if (status.isStart) flags.push('Start');
  if (status.isTerminalPositive) flags.push('✅ Terminal+');
  if (status.isTerminalNegative) flags.push('❌ Terminal−');

  if (flags.length === 0) return <span style={{ color: theme.colors.textLight, fontSize: theme.font.sizeXs }}>—</span>;

  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
      {flags.map((f) => (
        <span
          key={f}
          style={{
            ...badgeStyles.base,
            ...badgeStyles.neutral,
            fontSize: '0.65rem',
            padding: '0.1rem 0.4rem',
          }}
        >
          {f}
        </span>
      ))}
    </span>
  );
}

// ─── TransitionRow ─────────────────────────────────────────────────────────────

function TransitionRow({
  transition,
  index,
  onDelete,
  isDeleting,
}: {
  transition: ProcessTransitionDef;
  index: number;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [hovered, setHovered] = useState(false);
  const bgStyle = getRowStyle(index, hovered);

  const fromStatus = transition.fromStatus;
  const toStatus   = transition.toStatus;

  return (
    <tr
      style={bgStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* From */}
      <td style={{ ...tableStyles.cell }}>
        {fromStatus ? (
          <StatusChip name={fromStatus.name} color={fromStatus.color} />
        ) : (
          <span style={{ fontFamily: 'monospace', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
            {transition.fromStatusId.slice(0, 8)}…
          </span>
        )}
      </td>
      <td style={{ ...tableStyles.cell, color: theme.colors.textMuted }}>→</td>
      {/* To */}
      <td style={{ ...tableStyles.cell }}>
        {toStatus ? (
          <StatusChip name={toStatus.name} color={toStatus.color} />
        ) : (
          <span style={{ fontFamily: 'monospace', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
            {transition.toStatusId.slice(0, 8)}…
          </span>
        )}
      </td>
      {/* Label */}
      <td style={{ ...tableStyles.cell, fontWeight: theme.font.weightMedium }}>
        {transition.label}
      </td>
      {/* Roles */}
      <td style={{ ...tableStyles.cell }}>
        {transition.allowedRoles.length === 0 ? (
          <span style={{ color: theme.colors.textLight, fontSize: theme.font.sizeXs }}>Tous</span>
        ) : (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {transition.allowedRoles.map((r) => (
              <span
                key={r}
                style={{
                  ...badgeStyles.base,
                  ...badgeStyles.info,
                  fontSize: '0.65rem',
                  padding: '0.1rem 0.4rem',
                }}
              >
                {r}
              </span>
            ))}
          </span>
        )}
      </td>
      {/* Required fields */}
      <td style={{ ...tableStyles.cell }}>
        {transition.requiredFields.length === 0 ? (
          <span style={{ color: theme.colors.textLight, fontSize: theme.font.sizeXs }}>—</span>
        ) : (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
            {transition.requiredFields.map((f) => (
              <span
                key={f}
                style={{
                  ...badgeStyles.base,
                  ...badgeStyles.warning,
                  fontSize: '0.65rem',
                  padding: '0.1rem 0.4rem',
                }}
              >
                {f}
              </span>
            ))}
          </span>
        )}
      </td>
      {/* Sort order */}
      <td style={{ ...tableStyles.cellMuted, textAlign: 'center', fontSize: theme.font.sizeXs }}>
        {transition.sortOrder}
      </td>
      {/* Actions */}
      <td style={{ ...tableStyles.cell, whiteSpace: 'nowrap' }}>
        {deleteConfirm ? (
          <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.danger, fontWeight: theme.font.weightMedium }}>
              Confirmer ?
            </span>
            <button
              onClick={() => { onDelete(); setDeleteConfirm(false); }}
              disabled={isDeleting}
              style={{ ...buttonStyles.danger, ...buttonStyles.sm }}
            >
              Oui
            </button>
            <button onClick={() => setDeleteConfirm(false)} style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}>
              Non
            </button>
          </span>
        ) : (
          <button
            onClick={() => setDeleteConfirm(true)}
            style={{
              ...buttonStyles.sm,
              background: 'none',
              border: `1px solid ${theme.colors.danger}40`,
              color: theme.colors.danger,
              padding: '0.25rem 0.625rem',
              borderRadius: theme.radius.sm,
              cursor: 'pointer',
              fontSize: theme.font.sizeXs,
            }}
          >
            🗑
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Edit name modal ──────────────────────────────────────────────────────────

function EditProcessModal({
  proc,
  onClose,
}: {
  proc: ProcessDefinition;
  onClose: () => void;
}) {
  const updateProcess = useUpdateProcess();
  const [name, setName] = useState(proc.name);
  const [desc, setDesc] = useState(proc.description ?? '');
  const [isDefault, setIsDefault] = useState(proc.isDefault);

  async function handleSave() {
    await updateProcess.mutateAsync({
      id: proc.id,
      data: { name: name.trim(), description: desc.trim() || undefined, isDefault },
    });
    onClose();
  }

  return (
    <div
      style={{ ...modalStyles.overlay }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ ...modalStyles.content, maxWidth: '480px' }}>
        <div style={{ ...modalStyles.header }}>
          <h3 style={{ ...modalStyles.headerTitle }}>✏️ Modifier — {proc.name}</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: theme.colors.textMuted }}
          >
            ✕
          </button>
        </div>
        <div style={{ ...modalStyles.body }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ ...formStyles.label }}>
              Nom <span style={{ color: theme.colors.danger }}>*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...formStyles.input, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ ...formStyles.label }}>Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              style={{ ...formStyles.textarea, boxSizing: 'border-box' }}
            />
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: theme.font.sizeSm,
              color: theme.colors.text,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              style={{ width: '1rem', height: '1rem', accentColor: theme.colors.primary }}
            />
            Processus par défaut
          </label>
          {updateProcess.isError && (
            <p style={{ color: theme.colors.danger, fontSize: theme.font.sizeXs, marginTop: '0.5rem' }}>
              Erreur lors de la sauvegarde.
            </p>
          )}
        </div>
        <div style={{ ...modalStyles.footer }}>
          <button onClick={onClose} style={{ ...buttonStyles.secondary }}>Annuler</button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || updateProcess.isPending}
            style={{
              ...buttonStyles.primary,
              opacity: (!name.trim() || updateProcess.isPending) ? 0.6 : 1,
              cursor: (!name.trim() || updateProcess.isPending) ? 'not-allowed' : 'pointer',
            }}
          >
            {updateProcess.isPending ? 'Sauvegarde...' : '✓ Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProcessSettingsPage() {
  const { t } = useTranslation('settings');
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [editingProcess, setEditingProcess] = useState<ProcessDefinition | null>(null);

  return (
    <div style={{ ...layoutStyles.page }}>
      {/* Page header */}
      <div style={{ ...layoutStyles.pageHeader }}>
        <div>
          <h1 style={{ ...layoutStyles.pageTitle }}>🔀 {t('processes.title')}</h1>
          <p style={{ ...layoutStyles.pageSubtitle }}>
            {t('processes.subtitle', { defaultValue: 'Configuration des processus de workflow des bons de travail' })}
          </p>
        </div>
      </div>

      {/* Content — list or editor */}
      {selectedProcessId ? (
        <ProcessEditor
          processId={selectedProcessId}
          onBack={() => setSelectedProcessId(null)}
        />
      ) : (
        <ProcessList
          onSelect={(id) => setSelectedProcessId(id)}
          onEdit={(proc) => setEditingProcess(proc)}
        />
      )}

      {/* Edit modal */}
      {editingProcess && (
        <EditProcessModal
          proc={editingProcess}
          onClose={() => setEditingProcess(null)}
        />
      )}
    </div>
  );
}
