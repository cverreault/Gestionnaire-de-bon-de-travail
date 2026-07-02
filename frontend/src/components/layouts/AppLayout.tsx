import { Outlet } from 'react-router-dom';
import { useEffect, useRef } from 'react';
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
            <AdminSidebar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Top bar — global search (Ctrl+K) + notifications bell. */}
              <header style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1.5rem',
                borderBottom: theme.borders.light,
                background: theme.colors.surface,
                flexShrink: 0,
              }}>
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
