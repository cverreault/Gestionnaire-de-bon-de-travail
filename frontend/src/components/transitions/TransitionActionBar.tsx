import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect } from 'react';
import {
  useAvailableTransitions,
  useExecuteTransition,
} from '../../hooks/useAvailableTransitions';
import type { AvailableTransition } from '../../types';
import { theme, buttonStyles } from '../../theme';
import DynamicTransitionModal from './DynamicTransitionModal';

interface Props {
  workOrderId: string;
  onTransitionComplete?: () => void;
  variant?: 'buttons' | 'dropdown';
}

const REQUIRED_FIELD_LABELS: Record<string, string> = {
  assignedToId: 'Technicien assigné',
  negativeReason: 'Raison de fin négative',
  completionNotes: 'Notes de complétion',
  reopenReason: 'Raison de la ré-ouverture',
};

function buildRequiredFieldsHint(t: AvailableTransition): string {
  if (!t.requiredFields?.length) return '';
  const labels = t.requiredFields.map((f) => REQUIRED_FIELD_LABELS[f] ?? f);
  return `Champs requis : ${labels.join(', ')}`;
}

export default function TransitionActionBar({ workOrderId, onTransitionComplete, variant = 'buttons' }: Props) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAvailableTransitions(workOrderId);
  const executeTransition = useExecuteTransition(workOrderId);

  const [activeTransition, setActiveTransition] = useState<AvailableTransition | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number; maxHeight: number } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // ── Close dropdown on outside click ────────────────────────────────────────
  useEffect(() => {
    if (!dropdownOpen) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // ── Compute dropdown position based on the button rect ────────────────────
  useEffect(() => {
    if (!dropdownOpen || !buttonRef.current) {
      setDropdownPos(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const top = rect.bottom + 4;
    const right = window.innerWidth - rect.right;
    const maxHeight = Math.max(160, viewportH - top - 16);
    setDropdownPos({ top, right, maxHeight });
  }, [dropdownOpen]);

  // ── Cleanup toast timer on unmount to avoid setState on unmounted component ─
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // ── Toast auto-dismiss ─────────────────────────────────────────────────────
  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }

  // ── Direct transition (no required fields) ─────────────────────────────────
  function handleDirectTransition(t: AvailableTransition) {
    executeTransition.mutate(
      { targetStepId: t.toStatusId },
      {
        onSuccess: () => {
          showToast(`✅ Transition « ${t.label} » effectuée`, 'success');
          onTransitionComplete?.();
        },
        onError: (err: unknown) => {
          const axiosErr = err as { response?: { data?: { message?: string } } };
          const msg = axiosErr?.response?.data?.message ?? 'Erreur lors de la transition.';
          showToast(`❌ ${msg}`, 'error');
        },
      },
    );
  }

  // ── Click handler ──────────────────────────────────────────────────────────
  function handleClick(t: AvailableTransition) {
    if (t.requiredFields.length > 0) {
      setActiveTransition(t);
    } else {
      handleDirectTransition(t);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
        <span
          style={{
            display: 'inline-block',
            width: '1rem',
            height: '1rem',
            borderRadius: '50%',
            border: `2px solid ${theme.colors.primary}`,
            borderTopColor: 'transparent',
            animation: 'spin 0.7s linear infinite',
          }}
        />
        <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
          {t('common:messages.loading', { defaultValue: 'Chargement…' })}
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <p style={{ fontSize: theme.font.sizeSm, color: theme.colors.danger }}>
        Impossible de charger les actions disponibles.
      </p>
    );
  }

  const transitions = data?.transitions ?? [];

  return (
    <>
      {/* ── Spinner keyframe (inline style trick) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {variant === 'dropdown' ? (
        <div style={{ display: 'inline-block' }}>
          <button
            ref={buttonRef}
            type="button"
            onClick={() => transitions.length > 0 && setDropdownOpen((o) => !o)}
            disabled={executeTransition.isPending || transitions.length === 0}
            style={{
              ...buttonStyles.primary,
              fontSize: theme.font.sizeSm,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              opacity: (executeTransition.isPending || transitions.length === 0) ? 0.6 : 1,
              cursor: (executeTransition.isPending || transitions.length === 0) ? 'not-allowed' : 'pointer',
            }}
          >
            {executeTransition.isPending
              ? 'Mise à jour…'
              : transitions.length === 0
                ? 'Aucune action'
                : 'Changer le statut'}
            <span style={{ fontSize: '0.7rem' }}>▾</span>
          </button>
          {dropdownOpen && transitions.length > 0 && dropdownPos && (
            <div
              ref={dropdownRef}
              style={{
                position: 'fixed',
                top: dropdownPos.top,
                right: dropdownPos.right,
                background: theme.colors.surface,
                border: theme.borders.default,
                borderRadius: theme.radius.md,
                boxShadow: theme.shadows.lg,
                zIndex: 1000,
                minWidth: '220px',
                maxHeight: dropdownPos.maxHeight,
                overflowY: 'auto',
              }}
            >
              {transitions.map((t) => {
                const hint = buildRequiredFieldsHint(t);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setDropdownOpen(false); handleClick(t); }}
                    title={hint || undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      width: '100%',
                      padding: '0.6rem 0.875rem',
                      background: 'none',
                      border: 'none',
                      borderBottom: theme.borders.light,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: theme.font.sizeSm,
                      color: theme.colors.text,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: '0.7rem',
                        height: '0.7rem',
                        borderRadius: '50%',
                        background: t.toStatusColor || theme.colors.primary,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1 }}>{t.label}</span>
                    {hint && (
                      <span
                        aria-hidden="true"
                        style={{ fontSize: '0.75rem', color: theme.colors.textMuted, flexShrink: 0 }}
                      >
                        📝
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          {transitions.length === 0 ? (
            <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.textLight }}>
              Aucune action disponible pour ce statut.
            </span>
          ) : (
            transitions.map((t) => {
              const hint = buildRequiredFieldsHint(t);
              return (
                <button
                  key={t.id}
                  onClick={() => handleClick(t)}
                  disabled={executeTransition.isPending}
                  title={hint || undefined}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.5rem 1rem',
                    background: t.toStatusColor || theme.colors.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: theme.radius.md,
                    cursor: executeTransition.isPending ? 'not-allowed' : 'pointer',
                    fontWeight: theme.font.weightSemibold,
                    fontSize: theme.font.sizeSm,
                    opacity: executeTransition.isPending ? 0.6 : 1,
                    transition: 'opacity 0.15s ease',
                    boxShadow: theme.shadows.sm,
                  }}
                >
                  <span>{t.label}</span>
                  {hint && (
                    <span aria-hidden="true" style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                      📝
                    </span>
                  )}
                </button>
              );
            })
          )}

          {executeTransition.isPending && (
            <span style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeSm }}>
              Mise à jour...
            </span>
          )}
        </div>
      )}

      {/* ── Dynamic transition modal ────────────────────────────────────────── */}
      {activeTransition && (
        <DynamicTransitionModal
          isOpen
          workOrderId={workOrderId}
          transition={activeTransition}
          onClose={() => setActiveTransition(null)}
          onSuccess={() => {
            setActiveTransition(null);
            showToast(`✅ Transition « ${activeTransition.label} » effectuée`, 'success');
            onTransitionComplete?.();
          }}
        />
      )}

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: toast.type === 'error' ? '#991b1b' : '#1e293b',
            color: '#fff',
            padding: '0.875rem 1.5rem',
            borderRadius: theme.radius.lg,
            boxShadow: theme.shadows.xl,
            zIndex: theme.zIndex.toast,
            fontSize: theme.font.sizeSm,
            fontWeight: theme.font.weightMedium,
            pointerEvents: 'none',
            maxWidth: '90vw',
          }}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
