import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../context/auth.store';
import { Role } from '../../types';
import AdminSidebar from './AdminSidebar';
import TechnicianNav from './TechnicianNav';
import OfflineBanner from '../OfflineBanner';
import ImpersonationBanner from '../ImpersonationBanner';
import QuotaWarningBanner from '../QuotaWarningBanner';
import ToastHost from '../ToastHost';
import GlobalSearchBar from '../GlobalSearchBar';
import NotificationsBell from '../NotificationsBell';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { offlineStore } from '../../services/offline-store';
import { theme } from '../../theme';

/**
 * Root layout — renders sidebar for admin, bottom nav for technician.
 * Includes a fixed OfflineBanner when the device loses network connectivity.
 */
export default function AppLayout() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  // ADMIN / DISPATCHER / SUPER_ADMIN get the full desktop sidebar layout
  const isAdmin =
    user?.role === Role.ADMIN ||
    user?.role === Role.DISPATCHER ||
    user?.role === Role.SUPER_ADMIN;
  const isOnline = useOnlineStatus();
  const wasOffline = useRef(false);

  // B20 — responsive shell. Under `tablet` (1024px) the fixed sidebar
  // becomes an overlay drawer toggled by a hamburger in the header.
  const { isDesktop } = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Navigating closes the drawer (NavLink click lands here via route change).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Lock body scroll while the drawer is open on small screens.
  useEffect(() => {
    if (!isDesktop && drawerOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [drawerOpen, isDesktop]);

  // Initialize IndexedDB offline store on mount
  useEffect(() => {
    offlineStore.init().catch(console.error);
  }, []);

  // Sync pending actions when connectivity is restored, then refresh all queries
  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      offlineStore
        .syncPending()
        .then(() => {
          console.log('[Offline] Sync completed — refreshing data');
          // Invalidate all cached queries so the UI reflects the synced state
          return qc.invalidateQueries();
        })
        .catch(console.error);
    }
  }, [isOnline, qc]);

  // B21 — portal clients never see the staff shell (sidebar or
  // technician nav): bounce them to their own layout under /portail.
  // Placed after every hook call to respect the rules of hooks.
  if (user?.role === Role.CLIENT) {
    return <Navigate to="/portail" replace />;
  }

  return (
    <>
      {!isOnline && <OfflineBanner />}
      <ImpersonationBanner />
      <QuotaWarningBanner />
      <ToastHost />
      <div
        style={{
          display: 'flex',
          minHeight: '100vh',
          background: theme.colors.background,
          paddingTop: isOnline ? 0 : '2.25rem', // compensate for fixed banner height
        }}
      >
        {isAdmin ? (
          <>
            {/* Desktop : sidebar fixe historique. Tablette/téléphone :
                drawer par-dessus le contenu, ouvert via le hamburger. */}
            {isDesktop ? (
              <AdminSidebar />
            ) : (
              <>
                {drawerOpen && (
                  <div
                    onClick={() => setDrawerOpen(false)}
                    style={{
                      position: 'fixed',
                      inset: 0,
                      background: 'rgba(0,0,0,0.45)',
                      zIndex: theme.zIndex.overlay,
                    }}
                  />
                )}
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    height: '100dvh',
                    zIndex: theme.zIndex.overlay + 1,
                    transform: drawerOpen ? 'translateX(0)' : 'translateX(-105%)',
                    transition: 'transform 0.22s ease',
                    boxShadow: drawerOpen ? '4px 0 24px rgba(0,0,0,0.35)' : 'none',
                    overflowY: 'auto',
                  }}
                >
                  <AdminSidebar />
                </div>
              </>
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
              {/* Top bar — hamburger (petits écrans) + global search (Ctrl+K)
                  + notifications bell. */}
              <header style={{
                display: 'flex',
                justifyContent: isDesktop ? 'flex-end' : 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
                padding: isDesktop ? '0.75rem 1.5rem' : '0.6rem 0.75rem',
                borderBottom: theme.borders.light,
                background: theme.colors.surface,
                flexShrink: 0,
              }}>
                {!isDesktop && (
                  <button
                    onClick={() => setDrawerOpen((v) => !v)}
                    aria-label="Menu"
                    style={{
                      background: 'transparent',
                      border: theme.borders.light,
                      borderRadius: theme.radius.md,
                      padding: '0.45rem 0.65rem',
                      fontSize: '1.15rem',
                      lineHeight: 1,
                      cursor: 'pointer',
                      color: theme.colors.text,
                      flexShrink: 0,
                    }}
                  >
                    ☰
                  </button>
                )}
                <GlobalSearchBar />
                <NotificationsBell />
              </header>
              <main
                style={{
                  flex: 1,
                  padding: '1.5rem',
                  overflow: 'auto',
                  background: theme.colors.background,
                  transition: 'background 0.15s ease',
                }}
              >
                <Outlet />
              </main>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Floating bell — fixed top-right for the tech UI which has no header. */}
            <div
              style={{
                position: 'fixed',
                top: isOnline ? '0.75rem' : '3rem',
                right: '0.75rem',
                zIndex: theme.zIndex.dropdown ?? 1000,
                background: theme.colors.surface,
                borderRadius: '999px',
                boxShadow: theme.shadows.sm,
              }}
            >
              <NotificationsBell />
            </div>
            <main
              style={{
                flex: 1,
                padding: '1rem',
                overflow: 'auto',
                paddingBottom: '5rem',
                background: theme.colors.background,
                transition: 'background 0.15s ease',
              }}
            >
              <Outlet />
            </main>
            <TechnicianNav />
          </div>
        )}
      </div>
    </>
  );
}
