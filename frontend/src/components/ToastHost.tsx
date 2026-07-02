import { theme } from '../theme';
import { useToastStore } from '../context/toast.store';

const COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  success: { bg: theme.colors.success, fg: '#fff', border: theme.colors.success },
  error: { bg: theme.colors.danger, fg: '#fff', border: theme.colors.danger },
  info: { bg: theme.colors.surface, fg: theme.colors.text, border: theme.colors.border },
};

/**
 * Fixed bottom-right host for the toast queue (B7.6). Mounted once in
 * AppLayout; consumes the global Zustand toast store.
 */
export default function ToastHost() {
  const { items, dismiss } = useToastStore();
  if (items.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 5000,
        maxWidth: 360,
      }}
    >
      {items.map((t) => {
        const c = COLORS[t.kind] ?? COLORS.info;
        return (
          <div
            key={t.id}
            role="status"
            onClick={() => dismiss(t.id)}
            style={{
              background: c.bg,
              color: c.fg,
              border: `1px solid ${c.border}`,
              borderRadius: 6,
              padding: '10px 14px',
              fontSize: 13,
              boxShadow: theme.shadows.md,
              cursor: 'pointer',
            }}
          >
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
