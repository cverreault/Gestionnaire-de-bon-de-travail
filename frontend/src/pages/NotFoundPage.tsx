import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../context/auth.store';
import { theme, buttonStyles } from '../theme';

export default function NotFoundPage() {
  const { user, isAuthenticated } = useAuthStore();
  const { t } = useTranslation('common');
  const home = !isAuthenticated ? '/login' : user?.role === 'ADMIN' ? '/dashboard' : '/mes-bons';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        color: theme.colors.textMuted,
        background: theme.colors.background,
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '5rem' }}>🔍</div>
      <h1 style={{ fontSize: theme.font.size3xl, color: theme.colors.text, margin: 0 }}>
        {t('notFound.title', { defaultValue: 'Page introuvable' })}
      </h1>
      <p style={{ margin: 0, color: theme.colors.textSecondary }}>
        {t('notFound.description', { defaultValue: "La page que vous recherchez n'existe pas ou a été déplacée." })}
      </p>
      <Link
        to={home}
        style={{
          ...buttonStyles.primary,
          padding: '0.625rem 1.5rem',
          marginTop: '0.5rem',
          textDecoration: 'none',
        }}
      >
        {t('notFound.backHome', { defaultValue: "Retour à l'accueil" })}
      </Link>
    </div>
  );
}
