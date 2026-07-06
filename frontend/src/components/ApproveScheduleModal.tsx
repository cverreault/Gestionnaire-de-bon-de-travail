import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTechnicians } from '../hooks/useUsers';
import { useUpdateWorkOrder } from '../hooks/useWorkOrders';
import {
  useAvailableTransitions,
  useExecuteTransition,
} from '../hooks/useAvailableTransitions';
import { theme, buttonStyles, formStyles, modalStyles } from '../theme';
import { toast } from '../context/toast.store';

/**
 * B23 — one-step approval of a client-portal work request: pick a date
 * (and optionally a technician), then the request is approved (process
 * transition to the initial step) with everything set. Both fields are
 * optional — an empty submit is a plain approval.
 *
 * The approve transition is resolved from the available transitions:
 * label containing « approuv » first (seeded label), then the
 * code-0 convention as fallback for custom processes.
 */
export default function ApproveScheduleModal({
  workOrderId,
  onClose,
}: {
  workOrderId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('workOrders');
  const [scheduledDate, setScheduledDate] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [saving, setSaving] = useState(false);

  const technicians = useTechnicians();
  const updateWorkOrder = useUpdateWorkOrder(workOrderId);
  const transitions = useAvailableTransitions(workOrderId);
  const executeTransition = useExecuteTransition(workOrderId);

  const approveTransition =
    transitions.data?.transitions?.find((tr) =>
      (tr.label ?? '').toLowerCase().includes('approuv'),
    ) ?? transitions.data?.transitions?.find((tr) => tr.toStatusCode === 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!approveTransition || saving) return;
    setSaving(true);
    try {
      if (scheduledDate || assignedToId) {
        await updateWorkOrder.mutateAsync({
          ...(scheduledDate ? { scheduledDate: new Date(scheduledDate).toISOString() } : {}),
          ...(assignedToId ? { assignedToId } : {}),
        });
      }
      await executeTransition.mutateAsync({ targetStepId: approveTransition.toStatusId });
      toast.success(
        t('approveSchedule.success', { defaultValue: 'Demande approuvée' }),
      );
      onClose();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? String(err);
      toast.error(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={modalStyles.overlay}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ ...modalStyles.content, maxWidth: 460 }}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.headerTitle}>
            ✔ {t('approveSchedule.title', { defaultValue: 'Approuver et planifier' })}
          </h2>
          <button onClick={onClose} style={{ ...buttonStyles.ghost, padding: '0.25rem 0.5rem' }}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ ...modalStyles.body, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
            {t('approveSchedule.subtitle', {
              defaultValue:
                'La demande devient un bon de travail actif. Date et technicien sont optionnels — vous pourrez les fixer plus tard.',
            })}
          </p>

          <div>
            <label style={formStyles.label}>
              {t('approveSchedule.date', { defaultValue: 'Date prévue' })}
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              style={formStyles.input}
            />
          </div>

          <div>
            <label style={formStyles.label}>
              {t('approveSchedule.technician', { defaultValue: 'Technicien (optionnel)' })}
            </label>
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              style={formStyles.select}
            >
              <option value="">
                {t('approveSchedule.noTechnician', { defaultValue: '— Aucun pour l’instant —' })}
              </option>
              {(technicians.data ?? []).map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.firstName} {tech.lastName}
                </option>
              ))}
            </select>
          </div>

          {!approveTransition && !transitions.isLoading && (
            <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.danger }}>
              {t('approveSchedule.noTransition', {
                defaultValue:
                  'Aucune transition d’approbation disponible pour ce bon de travail.',
              })}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" onClick={onClose} style={buttonStyles.secondary}>
              {t('approveSchedule.cancel', { defaultValue: 'Annuler' })}
            </button>
            <button
              type="submit"
              disabled={!approveTransition || saving}
              style={{ ...buttonStyles.primary, opacity: !approveTransition || saving ? 0.6 : 1 }}
            >
              {saving
                ? t('approveSchedule.saving', { defaultValue: 'Approbation…' })
                : `✔ ${t('approveSchedule.submit', { defaultValue: 'Approuver' })}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
