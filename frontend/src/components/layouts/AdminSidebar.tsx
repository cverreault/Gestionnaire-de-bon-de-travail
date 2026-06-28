import { useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../context/auth.store';
import { useLogout } from '../../hooks/useAuth';
import { useTechnicians } from '../../hooks/useUsers';
import { useWorkOrders } from '../../hooks/useWorkOrders';
import { Role, WorkOrderStatus } from '../../types';
import { theme } from '../../theme';
import DispatchConfirmModal from '../DispatchConfirmModal';
import type { DispatchPayload } from '../DispatchConfirmModal';

// ─── Statuses considered "active" for the technician counter ─────────────────

const ACTIVE_STATUSES = new Set<WorkOrderStatus>([
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.DISPATCHED,
  WorkOrderStatus.EN_ROUTE,
  WorkOrderStatus.IN_PROGRESS,
]);

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
  const isAdmin = user?.role === Role.ADMIN;

  const sharedNavItems = [
    { to: '/dashboard',        label: `📊 ${t('nav:dashboard')}` },
    { to: '/bons-de-travail',  label: `📋 ${t('nav:workOrders')}` },
    { to: '/calendrier',       label: `📅 ${t('nav:calendar')}` },
    { to: '/clients',          label: `🧑‍🤝‍🧑 ${t('nav:clients')}` },
    { to: '/adresses',         label: `📍 ${t('nav:addresses')}` },
  ];

  const adminOnlyNavItems = [
    { to: '/utilisateurs', label: `👥 ${t('nav:users')}` },
    { to: '/parametres',   label: `⚙️ ${t('nav:settings')}` },
    { to: '/audit',        label: `📜 ${t('nav:audit', { defaultValue: 'Audit' })}` },
    { to: '/sauvegarde',   label: `💾 ${t('nav:backup')}` },
  ];

  // ── Pending dispatch state (modal) ───────────────────────────────────────
  const [pendingDispatch, setPendingDispatch] = useState<DispatchPayload | null>(null);

  // ── Drag-over highlight ──────────────────────────────────────────────────
  const [dragOverTechId, setDragOverTechId] = useState<string | null>(null);

  // ── Data ────────────────────────────────────────────────────────────────
  const { data: technicians = [] } = useTechnicians();

  // Fetch work orders (large limit, cached) to build per-technician active counts
  const { data: woPage } = useWorkOrders({ limit: 100, page: 1 });
  const allWOs = woPage?.data ?? [];

  const activeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const wo of allWOs) {
      if (wo.assignedToId && ACTIVE_STATUSES.has(wo.status)) {
        counts[wo.assignedToId] = (counts[wo.assignedToId] ?? 0) + 1;
      }
    }
    return counts;
  }, [allWOs]);

  // ── DnD handlers ────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent, techId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTechId(techId);
  }

  function handleDragLeave() {
    setDragOverTechId(null);
  }

  function handleDrop(e: React.DragEvent, techId: string, techName: string) {
    e.preventDefault();
    setDragOverTechId(null);

    const workOrderId = e.dataTransfer.getData('workOrderId');
    const workOrderTitle = e.dataTransfer.getData('workOrderTitle');
    const workOrderStatus = e.dataTransfer.getData('workOrderStatus') as WorkOrderStatus | '';

    if (!workOrderId) return;

    setPendingDispatch({
      workOrderId,
      workOrderTitle: workOrderTitle || workOrderId,
      technicianId: techId,
      technicianName: techName,
      workOrderStatus: workOrderStatus || undefined,
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <aside style={sidebarStyle}>
        {/* Logo */}
        <div style={logoStyle}>🔧 TaskMgr</div>

        {/* Main navigation */}
        <nav>
          {sharedNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} style={navLinkStyle}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Admin-only nav items */}
        {isAdmin && (
          <>
            <div style={sectionLabelStyle}>{t('nav:admin')}</div>
            <nav>
              {adminOnlyNavItems.map((item) => (
                <NavLink key={item.to} to={item.to} style={navLinkStyle}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </>
        )}

        {/* Technicians DnD section */}
        {technicians.length > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <div style={sectionLabelStyle}>
              {t('nav:techniciansDragHint', 'Techniciens — glisser un BT')}
            </div>

            {technicians
              .filter((t) => t.isActive)
              .map((tech) => {
                const count = activeCounts[tech.id] ?? 0;
                const isDragOver = dragOverTechId === tech.id;

                return (
                  <div
                    key={tech.id}
                    onDragOver={(e) => handleDragOver(e, tech.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, tech.id, `${tech.firstName} ${tech.lastName}`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 1.5rem',
                      borderLeft: isDragOver
                        ? `4px solid ${theme.colors.success}`
                        : '3px solid transparent',
                      borderBottom: `1px solid ${theme.colors.sidebarBorder}`,
                      background: isDragOver ? theme.colors.success : 'transparent',
                      boxShadow: isDragOver ? `inset 0 0 0 1px ${theme.colors.success}` : 'none',
                      transform: isDragOver ? 'scale(1.02)' : 'scale(1)',
                      transition: 'background 0.12s ease, border-left-color 0.12s ease, transform 0.12s ease',
                      cursor: 'default',
                    }}
                  >
                    {/* Name */}
                    <span
                      style={{
                        fontSize: theme.font.sizeSm,
                        color: isDragOver ? '#fff' : theme.colors.sidebarText,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      👷 {tech.firstName} {tech.lastName}
                    </span>

                    {/* Active BT counter badge */}
                    {count > 0 && (
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          background: theme.colors.primary,
                          color: '#fff',
                          borderRadius: theme.radius.full,
                          padding: '0 0.4rem',
                          fontSize: theme.font.sizeXs,
                          fontWeight: theme.font.weightBold,
                          lineHeight: '1.35rem',
                          minWidth: '1.35rem',
                          textAlign: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
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

      {/* Dispatch confirmation modal — rendered at the sidebar level */}
      {pendingDispatch && (
        <DispatchConfirmModal
          payload={pendingDispatch}
          onClose={() => setPendingDispatch(null)}
        />
      )}
    </>
  );
}
