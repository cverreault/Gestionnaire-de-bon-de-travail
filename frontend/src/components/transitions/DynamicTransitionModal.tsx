import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useExecuteTransition } from '../../hooks/useAvailableTransitions';
import type { AvailableTransition, ApiResponse, User } from '../../types';
import api from '../../services/api';
import {
  theme,
  modalStyles,
  buttonStyles,
  formStyles,
} from '../../theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  transition: AvailableTransition;
  onSuccess?: () => void;
}

// ─── Field metadata ───────────────────────────────────────────────────────────

const FIELD_META: Record<string, { label: string; type: 'textarea' | 'select-technician' }> = {
  assignedToId:    { label: 'Technicien assigné',        type: 'select-technician' },
  negativeReason:  { label: 'Raison de fin négative',    type: 'textarea' },
  completionNotes: { label: 'Notes de complétion',       type: 'textarea' },
  reopenReason:    { label: 'Raison de la ré-ouverture', type: 'textarea' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DynamicTransitionModal({
  isOpen,
  onClose,
  workOrderId,
  transition,
  onSuccess,
}: Props) {
  const executeTransition = useExecuteTransition(workOrderId);

  // Build a state map keyed by field name
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(transition.requiredFields.map((f) => [f, ''])),
  );

  // FIX 4 — reset field values whenever the transition changes (modal reused without unmount)
  useEffect(() => {
    setFieldValues(
      Object.fromEntries(transition.requiredFields.map((f) => [f, ''])),
    );
  }, [transition.id]);

  const needsTechnician = transition.requiredFields.includes('assignedToId');

  // Lazy-load technicians only when the field is required
  const { data: technicians = [] } = useQuery({
    queryKey: ['users', 'technicians'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<User[]>>('/users/technicians');
      return data.data;
    },
    enabled: isOpen && needsTechnician,
    staleTime: 5 * 60_000,
  });

  // ── Validation ─────────────────────────────────────────────────────────────
  const isValid = transition.requiredFields.every(
    (f) => fieldValues[f]?.trim().length > 0,
  );

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit() {
    if (!isValid) return;

    const dto = {
      targetStepId: transition.toStatusId,
      ...Object.fromEntries(
        transition.requiredFields
          .filter((f) => fieldValues[f]?.trim())
          .map((f) => [f, fieldValues[f].trim()]),
      ),
    };

    executeTransition.mutate(dto, {
      onSuccess: () => {
        onSuccess?.();
      },
    });
  }

  if (!isOpen) return null;

  return (
    <div
      style={{ ...modalStyles.overlay }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ ...modalStyles.content, maxWidth: '480px' }}>
        {/* Header */}
        <div style={{ ...modalStyles.header }}>
          <h3 style={{ ...modalStyles.headerTitle }}>{transition.label}</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: theme.colors.textMuted }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ ...modalStyles.body }}>
          {transition.requiredFields.map((field) => {
            const meta = FIELD_META[field] ?? { label: field, type: 'textarea' as const };
            const value = fieldValues[field] ?? '';

            return (
              <div key={field} style={{ marginBottom: '1rem' }}>
                <label style={{ ...formStyles.label }}>
                  {meta.label} <span style={{ color: theme.colors.danger }}>*</span>
                </label>

                {meta.type === 'select-technician' ? (
                  <select
                    value={value}
                    onChange={(e) => setFieldValues((prev) => ({ ...prev, [field]: e.target.value }))}
                    style={{ ...formStyles.select, boxSizing: 'border-box' }}
                  >
                    <option value="">— Choisir un technicien —</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <textarea
                    value={value}
                    onChange={(e) => setFieldValues((prev) => ({ ...prev, [field]: e.target.value }))}
                    rows={3}
                    placeholder={`Saisir ${meta.label.toLowerCase()}...`}
                    style={{ ...formStyles.textarea, boxSizing: 'border-box' }}
                  />
                )}
              </div>
            );
          })}

          {/* Target status preview */}
          <div
            style={{
              padding: '0.625rem 0.875rem',
              background: (transition.toStatusColor || theme.colors.primary) + '15',
              border: `1px solid ${(transition.toStatusColor || theme.colors.primary) + '40'}`,
              borderRadius: theme.radius.md,
              fontSize: theme.font.sizeSm,
              color: theme.colors.textSecondary,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '0.75rem', color: theme.colors.textMuted }}>
              Passage vers :
            </span>
            <span
              style={{
                background: (transition.toStatusColor || theme.colors.primary) + '1A',
                color: transition.toStatusColor || theme.colors.primary,
                border: `1px solid ${(transition.toStatusColor || theme.colors.primary) + '33'}`,
                padding: '0.125rem 0.5rem',
                borderRadius: theme.radius.full,
                fontSize: '0.75rem',
                fontWeight: theme.font.weightSemibold,
              }}
            >
              {transition.toStatusName}
            </span>
          </div>

          {/* API error */}
          {executeTransition.isError && (
            <div
              style={{
                marginTop: '0.75rem',
                background: theme.colors.dangerLight,
                border: '1px solid #fca5a5',
                color: theme.colors.danger,
                padding: '0.5rem 0.75rem',
                borderRadius: theme.radius.md,
                fontSize: theme.font.sizeXs,
              }}
            >
              {(executeTransition.error as { response?: { data?: { message?: string } } })
                ?.response?.data?.message ?? 'Erreur lors de la transition. Veuillez réessayer.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ ...modalStyles.footer }}>
          <button onClick={onClose} style={{ ...buttonStyles.secondary }}>
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || executeTransition.isPending}
            style={{
              ...buttonStyles.primary,
              opacity: (!isValid || executeTransition.isPending) ? 0.6 : 1,
              cursor: (!isValid || executeTransition.isPending) ? 'not-allowed' : 'pointer',
            }}
          >
            {executeTransition.isPending ? 'Exécution...' : '✓ Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
