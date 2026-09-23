import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { runBatch, type BatchAction, type BatchResult } from '../services/work-orders-batch.service';
import { theme, buttonStyles, formStyles } from '../theme';
import { toast } from '../context/toast.store';
import TagPicker from './TagPicker';

interface TechnicianOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface Props {
  selectedIds: string[];
  technicians: TechnicianOption[];
  onClear: () => void;
  /** Called after a run ; `result.failed` lists what did not go through. */
  onDone?: (result: BatchResult) => void;
}

const ACTIONS: Array<{ action: BatchAction; icon: string; key: string; fallback: string; danger?: boolean }> = [
  { action: 'ASSIGN', icon: '👤', key: 'batch.assign', fallback: 'Assigner' },
  { action: 'DISPATCH', icon: '📡', key: 'batch.dispatch', fallback: 'Répartir' },
  { action: 'UNASSIGN', icon: '↩', key: 'batch.unassign', fallback: 'Désassigner' },
  { action: 'SCHEDULE', icon: '📅', key: 'batch.schedule', fallback: 'Planifier' },
  { action: 'ADD_TAGS', icon: '🏷', key: 'batch.addTags', fallback: 'Ajouter des tags' },
  { action: 'REMOVE_TAGS', icon: '🏷', key: 'batch.removeTags', fallback: 'Retirer des tags' },
  { action: 'CANCEL', icon: '🚫', key: 'batch.cancel', fallback: 'Annuler les BT', danger: true },
];

/**
 * B55 — sticky bar shown above the work-order list as soon as rows are
 * selected. Each action opens a small inline panel for its parameter
 * (technician, date, reason), then runs the batch endpoint and reports
 * how many went through.
 */
export default function BatchActionsBar({ selectedIds, technicians, onClear, onDone }: Props) {
  const { t } = useTranslation('workOrders');
  const qc = useQueryClient();
  const [panel, setPanel] = useState<BatchAction | null>(null);
  const [technicianId, setTechnicianId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  if (selectedIds.length === 0) return null;
  const n = selectedIds.length;

  function toIso(day: string, time?: string): string | undefined {
    if (!day) return undefined;
    const d = new Date(`${day}T${time || '00:00'}:00`);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  function canRun(): boolean {
    switch (panel) {
      case 'ASSIGN':
      case 'DISPATCH':
        return !!technicianId;
      case 'CANCEL':
        return reason.trim().length > 0;
      case 'SCHEDULE':
        return !!date;
      case 'UNASSIGN':
        return true;
      case 'ADD_TAGS':
      case 'REMOVE_TAGS':
        return tagIds.length > 0;
      default:
        return false;
    }
  }

  async function run() {
    if (!panel || !canRun()) return;
    if (panel === 'CANCEL' && !window.confirm(t('batch.cancelConfirm', { defaultValue: `Annuler ${n} bon(s) de travail ?`, count: n }))) return;
    setRunning(true);
    try {
      const result = await runBatch({
        ids: selectedIds,
        action: panel,
        ...(panel === 'ASSIGN' || panel === 'DISPATCH' ? { technicianId } : {}),
        ...(panel === 'DISPATCH' && date ? { scheduledDate: toIso(date) } : {}),
        ...(panel === 'DISPATCH' && note.trim() ? { note: note.trim() } : {}),
        ...(panel === 'SCHEDULE'
          ? {
              scheduledDate: toIso(date),
              ...(startTime ? { scheduledStartTime: toIso(date, startTime) } : {}),
              ...(endTime ? { scheduledEndTime: toIso(date, endTime) } : {}),
            }
          : {}),
        ...(panel === 'CANCEL' ? { reason: reason.trim() } : {}),
        ...(panel === 'ADD_TAGS' || panel === 'REMOVE_TAGS' ? { tagIds } : {}),
      });
      void qc.invalidateQueries({ queryKey: ['work-orders'] });
      if (result.failed.length === 0) {
        toast.success(t('batch.allDone', { defaultValue: `${result.ok.length} BT traité(s)`, count: result.ok.length }));
      } else {
        const details = result.failed
          .slice(0, 5)
          .map((f) => `${f.referenceNumber ?? f.id} : ${f.error}`)
          .join(' · ');
        toast.error(
          t('batch.partial', {
            defaultValue: `${result.ok.length} réussi(s), ${result.failed.length} échec(s) — ${details}`,
            ok: result.ok.length,
            failed: result.failed.length,
            details,
          }),
        );
      }
      onDone?.(result);
      setPanel(null);
      setReason('');
      setNote('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const techSelect = (
    <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} style={{ ...formStyles.select, minWidth: 220 }}>
      <option value="">{t('batch.pickTechnician', { defaultValue: '— Technicien —' })}</option>
      {technicians.map((tech) => (
        <option key={tech.id} value={tech.id}>
          {tech.firstName} {tech.lastName}
        </option>
      ))}
    </select>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.6rem 0.9rem',
        marginBottom: '0.6rem',
        borderRadius: theme.radius.md,
        border: `1px solid ${theme.colors.primary}`,
        background: theme.colors.primaryLight,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ color: theme.colors.primary, fontSize: theme.font.sizeSm }}>
          {t('batch.selected', { defaultValue: `${n} sélectionné(s)`, count: n })}
        </strong>
        {ACTIONS.map((a) => (
          <button
            key={a.action}
            type="button"
            onClick={() => setPanel(panel === a.action ? null : a.action)}
            style={{
              ...buttonStyles.secondary,
              padding: '0.35rem 0.7rem',
              fontSize: theme.font.sizeSm,
              ...(panel === a.action ? { borderColor: theme.colors.primary, color: theme.colors.primary } : {}),
              ...(a.danger ? { color: theme.colors.danger } : {}),
            }}
          >
            {a.icon} {t(a.key, { defaultValue: a.fallback })}
          </button>
        ))}
        <button type="button" onClick={onClear} style={{ ...buttonStyles.secondary, padding: '0.35rem 0.7rem', fontSize: theme.font.sizeSm, marginLeft: 'auto' }}>
          ✕ {t('batch.clear', { defaultValue: 'Tout désélectionner' })}
        </button>
      </div>

      {panel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(panel === 'ASSIGN' || panel === 'DISPATCH') && techSelect}
          {(panel === 'DISPATCH' || panel === 'SCHEDULE') && (
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...formStyles.input, width: 170 }} />
          )}
          {panel === 'SCHEDULE' && (
            <>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ ...formStyles.input, width: 120 }} title={t('batch.startTime', { defaultValue: 'Début' })} />
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ ...formStyles.input, width: 120 }} title={t('batch.endTime', { defaultValue: 'Fin' })} />
            </>
          )}
          {panel === 'DISPATCH' && (
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('batch.notePlaceholder', { defaultValue: 'Note de dispatch (optionnel)' })} style={{ ...formStyles.input, minWidth: 220 }} />
          )}
          {panel === 'CANCEL' && (
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('batch.reasonPlaceholder', { defaultValue: "Raison de l'annulation (obligatoire)" })} style={{ ...formStyles.input, minWidth: 300 }} />
          )}
          {(panel === 'ADD_TAGS' || panel === 'REMOVE_TAGS') && (
            <TagPicker value={tagIds} onChange={setTagIds} variant="filter" includeInactive={panel === 'REMOVE_TAGS'} placeholder={t('batch.pickTags', { defaultValue: 'Choisir les tags' })} />
          )}
          {panel === 'UNASSIGN' && (
            <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.textSecondary }}>
              {t('batch.unassignHint', { defaultValue: 'Les BT reviennent à l’étape initiale, sans technicien.' })}
            </span>
          )}
          <button type="button" onClick={() => void run()} disabled={running || !canRun()} style={{ ...buttonStyles.primary, padding: '0.4rem 0.9rem', opacity: running || !canRun() ? 0.6 : 1 }}>
            {running ? t('batch.running', { defaultValue: 'En cours…' }) : t('batch.apply', { defaultValue: `Appliquer à ${n} BT`, count: n })}
          </button>
        </div>
      )}
    </div>
  );
}
