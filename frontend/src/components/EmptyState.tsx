import { theme, cardStyles } from '../theme';

/**
 * Actionable empty state (B7.10).
 *
 * Replaces bare "Aucun X" text with a friendlier block that tells the
 * user WHAT to do next. Used across list pages so that empty tenants /
 * users / clients don't feel like dead-ends.
 *
 * Kept intentionally simple : a big icon, a title, a short subtitle,
 * and an optional CTA button. No dependency on router — pass `onAction`
 * with whatever navigation / mutation you need.
 */
export interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon = '🗂️',
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div
      style={{
        ...cardStyles.card,
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 48, lineHeight: 1 }}>{icon}</div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: theme.colors.text,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 13,
            color: theme.colors.textMuted,
            maxWidth: 420,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </div>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            marginTop: 8,
            padding: '8px 18px',
            borderRadius: 6,
            background: theme.colors.primary,
            color: '#fff',
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
