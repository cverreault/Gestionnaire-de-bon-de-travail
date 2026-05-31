import { useAssignAndDispatch, useUpdateWorkOrder } from '../hooks/useWorkOrders';
import { WorkOrderStatus } from '../types';
import { theme, modalStyles, buttonStyles } from '../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DispatchPayload {
  workOrderId: string;
  workOrderTitle: string;
  technicianId: string;
  technicianName: string;
  workOrderStatus?: WorkOrderStatus;
}

interface Props {
  payload: DispatchPayload;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DispatchConfirmModal({ payload, onClose }: Props) {
  const assignAndDispatch = useAssignAndDispatch();
  const assignOnly = useUpdateWorkOrder(payload.workOrderId);

  // Le BT est en mode "création" (assign classique) ou en mode "réassignation"
  const isNewAssign = !payload.workOrderStatus
    || payload.workOrderStatus === WorkOrderStatus.CREATED
    || payload.workOrderStatus === WorkOrderStatus.ASSIGNED;

  async function handleReassign() {
    try {
      await assignOnly.mutateAsync({
        assignedToId: payload.technicianId,
        status: WorkOrderStatus.ASSIGNED,
      });
      onClose();
    } catch {
      // l'état isError déclenche l'affichage de l'erreur dans le rendu
    }
  }

  async function handleAssignOnly() {
    try {
      await assignOnly.mutateAsync({
        assignedToId: payload.technicianId,
      });
      onClose(); // fermeture uniquement en cas de succès
    } catch {
      // l'état isError déclenche l'affichage de l'erreur dans le rendu
    }
  }

  async function handleConfirm() {
    try {
      await assignAndDispatch.mutateAsync({
        workOrderId: payload.workOrderId,
        technicianId: payload.technicianId,
      });
      onClose(); // fermeture uniquement en cas de succès
    } catch {
      // l'état isError déclenche l'affichage de l'erreur dans le rendu
    }
  }

  return (
    /* Overlay */
    <div style={{ ...modalStyles.overlay }} onClick={onClose}>
      {/* Panel — stop propagation so clicks inside don't close the modal */}
      <div
        style={{ ...modalStyles.content, maxWidth: '420px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ ...modalStyles.header }}>
          <h3 style={{ ...modalStyles.headerTitle }}>
            {isNewAssign ? '📋 Assigner un bon de travail' : '🔄 Réassigner un bon de travail'}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: theme.colors.textMuted,
              lineHeight: 1,
              padding: '0.25rem',
            }}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ ...modalStyles.body }}>
          <p style={{ margin: '0 0 1rem', color: theme.colors.text, fontSize: theme.font.sizeSm }}>
            {isNewAssign
              ? 'Choisissez comment assigner ce bon de travail :'
              : 'Réassigner ce bon de travail ? Le statut passera à Assigné.'}
          </p>

          {/* BT info */}
          <div
            style={{
              background: theme.colors.primaryLight,
              border: `1px solid ${theme.colors.primary}30`,
              borderRadius: theme.radius.md,
              padding: '0.75rem 1rem',
              marginBottom: '0.75rem',
            }}
          >
            <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
              Bon de travail
            </p>
            <p
              style={{
                margin: '0.25rem 0 0',
                fontWeight: theme.font.weightSemibold,
                color: theme.colors.text,
                fontSize: theme.font.sizeMd,
              }}
            >
              {payload.workOrderTitle}
            </p>
          </div>

          {/* Technician info */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: theme.colors.surfaceAlt,
              border: theme.borders.default,
              borderRadius: theme.radius.md,
              padding: '0.75rem 1rem',
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>👷</span>
            <div>
              <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                Technicien assigné
              </p>
              <p
                style={{
                  margin: '0.125rem 0 0',
                  fontWeight: theme.font.weightSemibold,
                  color: theme.colors.text,
                  fontSize: theme.font.sizeSm,
                }}
              >
                {payload.technicianName}
              </p>
            </div>
          </div>

          {(assignAndDispatch.isError || assignOnly.isError) && (
            <p
              style={{
                marginTop: '0.75rem',
                color: theme.colors.danger,
                fontSize: theme.font.sizeSm,
                background: theme.colors.dangerLight,
                padding: '0.5rem 0.75rem',
                borderRadius: theme.radius.sm,
                border: `1px solid #fca5a5`,
              }}
            >
              ✕ Erreur lors de l'assignation. Veuillez réessayer.
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ ...modalStyles.footer }}>
          <button
            onClick={onClose}
            disabled={assignAndDispatch.isPending || assignOnly.isPending}
            style={{ ...buttonStyles.secondary }}
          >
            Annuler
          </button>
          {isNewAssign ? (
            <>
              <button
                onClick={handleAssignOnly}
                disabled={assignOnly.isPending || assignAndDispatch.isPending}
                style={{
                  ...buttonStyles.secondary,
                  ...(assignOnly.isPending ? buttonStyles.disabled : {}),
                }}
              >
                {assignOnly.isPending ? 'Assignation...' : '👤 Assigner seulement'}
              </button>
              <button
                onClick={handleConfirm}
                disabled={assignAndDispatch.isPending || assignOnly.isPending}
                style={{
                  ...buttonStyles.primary,
                  ...(assignAndDispatch.isPending ? buttonStyles.disabled : {}),
                }}
              >
                {assignAndDispatch.isPending ? 'Dispatch en cours...' : '📤 Assigner + Dispatcher'}
              </button>
            </>
          ) : (
            <button
              onClick={handleReassign}
              disabled={assignOnly.isPending}
              style={{
                ...buttonStyles.primary,
                ...(assignOnly.isPending ? buttonStyles.disabled : {}),
              }}
            >
              {assignOnly.isPending ? 'Réassignation...' : '🔄 Réassigner'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
