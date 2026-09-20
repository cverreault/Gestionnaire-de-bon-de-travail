import { useEffect } from 'react';
import { theme } from '../theme';
import WorkOrderDetailPage from '../pages/WorkOrderDetailPage';

interface Props {
  workOrderId: string;
  onClose: () => void;
}

/**
 * Work-order detail as an overlay on top of the list / dispatch board, so the
 * dispatcher never loses the page state. Escape or the backdrop closes it.
 */
export default function WorkOrderModal({ workOrderId, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '2rem 1rem', overflowY: 'auto' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{ width: '100%', maxWidth: '960px', background: theme.colors.background, borderRadius: theme.radius.lg, boxShadow: theme.shadows.lg, position: 'relative', minHeight: '40vh' }}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{ position: 'sticky', top: 0, float: 'right', margin: '0.75rem', zIndex: 2, border: theme.borders.default, background: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.full, width: 36, height: 36, cursor: 'pointer', fontSize: '1.1rem', boxShadow: theme.shadows.sm }}
        >
          ✕
        </button>
        <WorkOrderDetailPage idOverride={workOrderId} onClose={onClose} embedded />
      </div>
    </div>
  );
}
