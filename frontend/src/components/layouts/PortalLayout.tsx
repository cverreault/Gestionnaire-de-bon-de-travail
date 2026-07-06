import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { useLogout } from '../../hooks/useAuth';
import { useAuthStore } from '../../context/auth.store';
import logoHeaderFr from '../../assets/logo-header-fr.png';
import logoHeaderEn from '../../assets/logo-header-en.png';

/**
 * B21 — client-portal shell: a slim top bar (logo, nav, language,
 * logout) + content. Deliberately NOT AppLayout: portal users never see
 * the staff sidebar or the technician bottom nav.
 */

const linkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  padding: '0.4rem 0.75rem',
  borderRadius: theme.radius.md,
  textDecoration: 'none',
  fontSize: theme.font.sizeSm,
  fontWeight: isActive ? theme.font.weightSemibold : theme.font.weightNormal,
  color: isActive ? theme.colors.primary : theme.colors.textSecondary,
  background: isActive ? 'rgba(30, 64, 175, 0.08)' : 'transparent',
});

export default function PortalLayout() {
  const { t, i18n } = useTranslation('portal');
  const logout = useLogout();
  const { user } = useAuthStore();
  const locale = i18n.language?.startsWith('en') ? 'en' : 'fr';

  return (
    <div style={{ minHeight: '100dvh', background: theme.colors.background, display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          padding: '0.6rem 1rem',
          background: theme.colors.surface,
          borderBottom: theme.borders.light,
          position: 'sticky',
          top: 0,
          zIndex: theme.zIndex.sticky,
        }}
      >
        <div style={{ background: '#fff', borderRadius: 8, padding: '2px 8px', display: 'flex', alignItems: 'center' }}>
          <img
            src={locale === 'fr' ? logoHeaderFr : logoHeaderEn}
            alt="Dispatch2Go"
            style={{ height: 30, display: 'block' }}
          />
        </div>

        <nav style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          <NavLink to="/portail" end style={linkStyle}>
            📋 {t('nav.myWorkOrders')}
          </NavLink>
          <NavLink to="/portail/demande" style={linkStyle}>
            ➕ {t('nav.newRequest')}
          </NavLink>
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>
            {user?.firstName} {user?.lastName}
          </span>
          <button
            onClick={() => i18n.changeLanguage(locale === 'fr' ? 'en' : 'fr')}
            style={{
              background: 'none',
              border: theme.borders.light,
              borderRadius: theme.radius.md,
              padding: '0.25rem 0.5rem',
              cursor: 'pointer',
              fontSize: theme.font.sizeSm,
              color: theme.colors.textSecondary,
            }}
          >
            {locale === 'fr' ? 'EN' : 'FR'}
          </button>
          <button
            onClick={logout}
            style={{
              background: 'none',
              border: theme.borders.light,
              borderRadius: theme.radius.md,
              padding: '0.25rem 0.6rem',
              cursor: 'pointer',
              fontSize: theme.font.sizeSm,
              color: theme.colors.textSecondary,
            }}
          >
            🚪 {t('nav.logout')}
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: '1.25rem', maxWidth: 960, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <Outlet />
      </main>

      <footer style={{ textAlign: 'center', padding: '0.75rem', fontSize: theme.font.sizeXs }}>
        <a href="/confidentialite" style={{ color: theme.colors.textMuted, textDecoration: 'underline' }}>
          {locale === 'fr' ? 'Politique de confidentialité' : 'Privacy policy'}
        </a>
      </footer>
    </div>
  );
}
