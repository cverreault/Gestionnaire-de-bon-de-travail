import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLogout } from '../../hooks/useAuth';
import { theme } from '../../theme';

const navStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  background: theme.colors.surface,
  borderTop: theme.borders.dark,
  display: 'flex',
  justifyContent: 'space-around',
  padding: '0.5rem 0',
  zIndex: theme.zIndex.sticky,
  boxShadow: '0 -2px 8px rgba(0,0,0,0.10)',
};

const linkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.2rem',
  padding: '0.4rem 1rem',
  color: isActive ? theme.colors.primary : theme.colors.textMuted,
  textDecoration: 'none',
  fontSize: theme.font.sizeXs,
  fontWeight: isActive ? theme.font.weightSemibold : theme.font.weightNormal,
  transition: 'color 0.15s ease',
});

export default function TechnicianNav() {
  const logout = useLogout();
  const { t } = useTranslation();

  return (
    <nav style={navStyle}>
      {/* My work orders */}
      <NavLink to="/mes-bons" style={linkStyle}>
        <span style={{ fontSize: '1.4rem' }}>📋</span>
        {t('nav:myWorkOrders')}
      </NavLink>

      {/* My truck stock (B24) */}
      <NavLink to="/mon-stock" style={linkStyle}>
        <span style={{ fontSize: '1.4rem' }}>📦</span>
        {t('nav:myStock')}
      </NavLink>

      {/* Profile */}
      <NavLink to="/profil" style={linkStyle}>
        <span style={{ fontSize: '1.4rem' }}>🙍</span>
        {t('nav:profile')}
      </NavLink>

      {/* Release notes */}
      <NavLink to="/release-notes" style={linkStyle}>
        <span style={{ fontSize: '1.4rem' }}>📝</span>
        {t('nav:releaseNotes')}
      </NavLink>

      {/* Logout */}
      <button
        onClick={logout}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.2rem',
          padding: '0.4rem 1rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: theme.colors.textMuted,
          fontSize: theme.font.sizeXs,
          transition: 'color 0.15s ease',
        }}
      >
        <span style={{ fontSize: '1.4rem' }}>🚪</span>
        {t('nav:logout')}
      </button>
    </nav>
  );
}
