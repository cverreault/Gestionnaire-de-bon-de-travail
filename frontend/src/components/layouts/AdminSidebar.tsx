import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getBranding } from '../../services/super-admin.service';
import { useAuthStore } from '../../context/auth.store';
import { useUiStore } from '../../context/ui.store';
import logoHeaderFr from '../../assets/logo-header-fr.png';
import logoHeaderEn from '../../assets/logo-header-en.png';
import { useLogout } from '../../hooks/useAuth';
import { Role } from '../../types';
import { theme } from '../../theme';

// ─── Styles ───────────────────────────────────────────────────────────────────

const sidebarStyle: React.CSSProperties = {
  width: '240px',
  minHeight: '100vh',
  background: theme.colors.sidebarBg,
  color: theme.colors.sidebarText,
  display: 'flex',
  flexDirection: 'column',
  padding: '1rem 0',
  borderRight: `1px solid ${theme.colors.sidebarBorder}`,
  flexShrink: 0,
  overflowY: 'auto',
};

const logoStyle: React.CSSProperties = {
  padding: '1rem 1.5rem',
  fontSize: '1.25rem',
  fontWeight: theme.font.weightBold,
  borderBottom: `1px solid ${theme.colors.sidebarBorder}`,
  marginBottom: '0.5rem',
  color: theme.colors.sidebarText,
  letterSpacing: '0.01em',
};

const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  display: 'block',
  padding: '0.75rem 1.5rem',
  color: isActive ? '#fff' : theme.colors.sidebarText,
  background: isActive ? theme.colors.sidebarActive : 'transparent',
  textDecoration: 'none',
  borderLeft: isActive ? `3px solid ${theme.colors.primary}` : '3px solid transparent',
  borderBottom: `1px solid ${theme.colors.sidebarBorder}`,
  transition: 'background 0.15s ease, color 0.15s ease',
  fontSize: theme.font.sizeSm,
  fontWeight: isActive ? theme.font.weightSemibold : theme.font.weightNormal,
});

/** Collapsible group header (e.g. « Répartition ») — same footprint as a link. */
const groupHeaderStyle = (childActive: boolean): React.CSSProperties => ({
  ...navLinkStyle({ isActive: false }),
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: childActive ? '#fff' : theme.colors.sidebarText,
  fontWeight: childActive ? theme.font.weightSemibold : theme.font.weightNormal,
});

/** Child link of a group : indented under its header. */
const groupChildStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  ...navLinkStyle({ isActive }),
  paddingLeft: '2.5rem',
});

const sectionLabelStyle: React.CSSProperties = {
  padding: '0.625rem 1.5rem 0.25rem',
  fontSize: '0.65rem',
  fontWeight: theme.font.weightBold,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: theme.colors.sidebarBorder,
  userSelect: 'none',
};

const userBoxStyle: React.CSSProperties = {
  marginTop: 'auto',
  padding: '1rem 1.5rem',
  borderTop: `1px solid ${theme.colors.sidebarBorder}`,
  fontSize: theme.font.sizeSm,
  color: theme.colors.sidebarText,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminSidebar() {
  const { user } = useAuthStore();
  const logout = useLogout();
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  // SUPER_ADMIN is intentionally NOT in `isAdmin` — its portal lives under
  // /super-admin and must never expose tenant data (BTs, clients, etc.).
  // The SA acts on a tenant via impersonation, which swaps the role to
  // ADMIN client-side and re-renders this sidebar with the full ADMIN nav.
  const isAdmin = user?.role === Role.ADMIN;
  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;

  // Per-tenant branding resolved from the subdomain (B7.5). Generic TaskMgr
  // on the apex / operator subdomain (SUPER_ADMIN console).
  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: getBranding,
    staleTime: Infinity,
    retry: false,
  });

  // « Répartition » groups the two dispatcher screens : the work-order page
  // (list / dispatch board, technician panel) and the dispatch map.
  const dispatchGroupItems = [
    { to: '/bons-de-travail',  label: `📋 ${t('nav:workOrders')}` },
    { to: '/parametres/bons-recurrents', label: `🔁 ${t('nav:recurring', { defaultValue: 'BT récurrents' })}` },
    { to: '/carte-dispatch',   label: `🗺️ ${t('nav:dispatchMap', { defaultValue: 'Carte dispatch' })}` },
  ];

  // « Paramètres » groups the configuration screens.
  const settingsGroupItems = [
    { to: '/parametres',          label: `⚙️ ${t('nav:settings')}`, end: true },
    { to: '/parametres/api-keys', label: `🔑 ${t('nav:apiKeys', { defaultValue: 'Clés API' })}` },
    { to: '/parametres/webhooks', label: `🔔 ${t('nav:webhooks', { defaultValue: 'Webhooks' })}` },
    { to: '/parametres/alertes',  label: `🚨 ${t('nav:alerts', { defaultValue: 'Alertes' })}` },
  ];

  const sharedNavItems = [
    { to: '/calendrier',       label: `📅 ${t('nav:calendar')}` },
    { to: '/clients',          label: `🧑‍🤝‍🧑 ${t('nav:clients')}` },
    { to: '/adresses',         label: `📍 ${t('nav:addresses')}` },
    { to: '/inventaire',       label: `📦 ${t('nav:inventory')}` },
    { to: '/rapports',         label: `📈 ${t('nav:reports', { defaultValue: 'Rapports' })}` },
  ];

  // The group stays open while one of its pages is active ; otherwise the
  // user can fold it.
  const { pathname } = useLocation();
  const dispatchChildActive = dispatchGroupItems.some((i) => pathname.startsWith(i.to));
  const [dispatchOpen, setDispatchOpen] = useState(true);
  const dispatchExpanded = dispatchOpen || dispatchChildActive;
  const settingsChildActive = pathname.startsWith('/parametres') && !pathname.startsWith('/parametres/bons-recurrents');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsExpanded = settingsOpen || settingsChildActive;

  const adminOnlyNavItems = [
    { to: '/utilisateurs',    label: `👥 ${t('nav:users')}`, end: true },
    { to: '/utilisateurs/connexions', label: `🔐 ${t('nav:connections', { defaultValue: 'Connexions' })}` },
    { to: '/audit',           label: `📜 ${t('nav:audit', { defaultValue: 'Audit' })}` },
    { to: '/mon-abonnement',  label: `💳 ${t('nav:mySubscription', { defaultValue: 'Mon abonnement' })}` },
  ];

  const superAdminNavItems = [
    { to: '/super-admin/stats',    label: `📊 ${t('nav:saDashboard', { defaultValue: 'Tableau de bord' })}` },
    { to: '/super-admin/tenants',  label: `🌍 ${t('nav:saTenants', { defaultValue: 'Tenants' })}` },
    { to: '/super-admin/tenants/nouveau', label: `➕ ${t('nav:saTenantCreate', { defaultValue: 'Créer un tenant' })}` },
    { to: '/super-admin/plans',    label: `💳 ${t('nav:saPlans', { defaultValue: 'Plans & tarifs' })}` },
    { to: '/super-admin/audit',    label: `📜 ${t('nav:saAudit', { defaultValue: 'Audit cross-tenant' })}` },
    { to: '/super-admin/users',    label: `🔍 ${t('nav:saUsers', { defaultValue: 'Rechercher utilisateur' })}` },
    { to: '/super-admin/all-users', label: `👥 ${t('nav:saAllUsers', { defaultValue: 'Tous les utilisateurs' })}` },
    { to: '/super-admin/platform-users', label: `🛡️ ${t('nav:saPlatformUsers', { defaultValue: 'SUPER_ADMINs' })}` },
    { to: '/super-admin/geo',      label: `🗺️ ${t('nav:saGeo', { defaultValue: 'Référentiel d’adresses' })}` },
    { to: '/super-admin/sauvegarde', label: `💾 ${t('nav:backup')}` },
    { to: '/super-admin',          label: `⚙️ ${t('nav:saConfig', { defaultValue: 'Configuration plateforme' })}` },
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <aside style={sidebarStyle}>
        {/* Logo — per-tenant when on a tenant subdomain, otherwise the
            bilingual Dispatch2Go wordmark. The wordmark is dark navy on
            transparent, so it sits on a white rounded chip to stay legible
            against the dark sidebar. */}
        {branding?.logoUrl ? (
          <div style={{ ...logoStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src={branding.logoUrl}
              alt={branding.name}
              style={{ maxHeight: 28, maxWidth: 120, objectFit: 'contain' }}
            />
            <span>{branding.name}</span>
          </div>
        ) : (
          <div style={{ ...logoStyle, padding: '0.75rem 1rem' }}>
            <div
              style={{
                background: '#ffffff',
                borderRadius: 8,
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <img
                src={locale === 'fr' ? logoHeaderFr : logoHeaderEn}
                alt="Dispatch2Go"
                style={{ width: '100%', maxWidth: 180, height: 'auto', display: 'block' }}
              />
            </div>
          </div>
        )}

        {/* Main navigation — hidden for SUPER_ADMIN (no tenant data in the
            SA portal). The SA console is the super-admin nav block below. */}
        {!isSuperAdmin && (
          <nav>
            <NavLink to="/dashboard" style={navLinkStyle}>
              📊 {t('nav:dashboard')}
            </NavLink>

            <button
              type="button"
              onClick={() => setDispatchOpen((o) => !o)}
              aria-expanded={dispatchExpanded}
              aria-controls="nav-dispatch-group"
              style={groupHeaderStyle(dispatchChildActive)}
            >
              <span>🚚 {t('nav:dispatch', { defaultValue: 'Répartition' })}</span>
              <span aria-hidden style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                {dispatchExpanded ? '▾' : '▸'}
              </span>
            </button>
            {dispatchExpanded && (
              <div id="nav-dispatch-group">
                {dispatchGroupItems.map((item) => (
                  <NavLink key={item.to} to={item.to} style={groupChildStyle}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}

            {sharedNavItems.map((item) => (
              <NavLink key={item.to} to={item.to} style={navLinkStyle}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}

        {/* Admin-only nav items */}
        {isAdmin && (
          <>
            <div style={sectionLabelStyle}>{t('nav:admin')}</div>
            <nav>
              {adminOnlyNavItems.slice(0, 2).map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} style={navLinkStyle}>
                  {item.label}
                </NavLink>
              ))}

              <button
                type="button"
                onClick={() => setSettingsOpen((o) => !o)}
                aria-expanded={settingsExpanded}
                aria-controls="nav-settings-group"
                style={groupHeaderStyle(settingsChildActive)}
              >
                <span>⚙️ {t('nav:settings')}</span>
                <span aria-hidden style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                  {settingsExpanded ? '▾' : '▸'}
                </span>
              </button>
              {settingsExpanded && (
                <div id="nav-settings-group">
                  {settingsGroupItems.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} style={groupChildStyle}>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}

              {adminOnlyNavItems.slice(2).map((item) => (
                <NavLink key={item.to} to={item.to} style={navLinkStyle}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </>
        )}

        {/* Super-admin only */}
        {isSuperAdmin && (
          <>
            <div style={sectionLabelStyle}>
              {t('nav:platform', { defaultValue: 'Plateforme' })}
            </div>
            <nav>
              {superAdminNavItems.map((item) => (
                <NavLink key={item.to} to={item.to} style={navLinkStyle}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </>
        )}

        {/* Bottom user info + profile link + logout */}
        <div style={userBoxStyle}>
          {/* User name */}
          <div
            style={{
              marginBottom: '0.5rem',
              color: theme.colors.sidebarText,
              opacity: 0.85,
              fontSize: theme.font.sizeSm,
              fontWeight: theme.font.weightMedium,
            }}
          >
            {user?.firstName} {user?.lastName}
            <span
              style={{
                marginLeft: '0.4rem',
                fontSize: theme.font.sizeXs,
                opacity: 0.6,
                fontWeight: theme.font.weightNormal,
              }}
            >
              ({user?.role === Role.ADMIN
                ? t('auth:roles.ADMIN')
                : user?.role === Role.DISPATCHER
                  ? t('auth:roles.DISPATCHER')
                  : t('auth:roles.TECHNICIAN')})
            </span>
          </div>

          {/* Notes de version link */}
          <NavLink
            to="/release-notes"
            style={({ isActive }) => ({
              display: 'block',
              marginBottom: '0.5rem',
              padding: '0.35rem 0.75rem',
              borderRadius: theme.radius.sm,
              background: isActive ? theme.colors.sidebarActive : 'rgba(255,255,255,0.06)',
              border: `1px solid ${theme.colors.sidebarBorder}`,
              color: theme.colors.sidebarText,
              textDecoration: 'none',
              fontSize: theme.font.sizeSm,
              transition: 'background 0.15s ease',
            })}
          >
            📋 {t('nav:releaseNotes')}
          </NavLink>

          {/* API documentation link — visible to any signed-in user */}
          <NavLink
            to="/documentation-api"
            style={({ isActive }) => ({
              display: 'block',
              marginBottom: '0.5rem',
              padding: '0.35rem 0.75rem',
              borderRadius: theme.radius.sm,
              background: isActive ? theme.colors.sidebarActive : 'rgba(255,255,255,0.06)',
              border: `1px solid ${theme.colors.sidebarBorder}`,
              color: theme.colors.sidebarText,
              textDecoration: 'none',
              fontSize: theme.font.sizeSm,
              transition: 'background 0.15s ease',
            })}
          >
            📚 {t('nav:apiDocs', { defaultValue: 'Documentation API' })}
          </NavLink>

          {/* Mon profil link */}
          <NavLink
            to="/profil"
            style={({ isActive }) => ({
              display: 'block',
              marginBottom: '0.5rem',
              padding: '0.35rem 0.75rem',
              borderRadius: theme.radius.sm,
              background: isActive ? theme.colors.sidebarActive : 'rgba(255,255,255,0.06)',
              border: `1px solid ${theme.colors.sidebarBorder}`,
              color: theme.colors.sidebarText,
              textDecoration: 'none',
              fontSize: theme.font.sizeSm,
              transition: 'background 0.15s ease',
            })}
          >
            🙍 {t('nav:profile')}
          </NavLink>

          {/* Logout */}
          <button
            onClick={logout}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: `1px solid ${theme.colors.sidebarBorder}`,
              color: theme.colors.sidebarText,
              padding: '0.4rem 1rem',
              borderRadius: theme.radius.sm,
              cursor: 'pointer',
              width: '100%',
              fontSize: theme.font.sizeSm,
              transition: 'background 0.15s ease',
            }}
          >
            {t('nav:logout')}
          </button>
        </div>
      </aside>
    </>
  );
}
