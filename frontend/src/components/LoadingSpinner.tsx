import { theme } from '../theme';

interface Props {
  message?: string;
  fullPage?: boolean;
}

export default function LoadingSpinner({ message = 'Chargement...', fullPage = false }: Props) {
  const style: React.CSSProperties = fullPage
    ? {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: '1rem',
        color: theme.colors.textMuted,
      }
    : {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        color: theme.colors.textMuted,
        padding: '1rem',
      };

  return (
    <div style={style}>
      <div
        style={{
          width: '2rem',
          height: '2rem',
          border: `3px solid ${theme.colors.borderLight}`,
          borderTop: `3px solid ${theme.colors.primary}`,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span>{message}</span>
    </div>
  );
}
