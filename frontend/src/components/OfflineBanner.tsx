import { useState, useEffect } from 'react';
import { offlineStore } from '../services/offline-store';
import { theme } from '../theme';

/**
 * Fixed banner displayed at the top of the screen when the user is offline.
 * Shows the number of pending sync actions queued in IndexedDB.
 * Mutations queued while offline will be replayed on reconnection via offlineStore.
 */
export default function OfflineBanner() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // Load count immediately when banner appears
    offlineStore.getPendingCount().then(setPendingCount).catch(() => setPendingCount(0));

    // Refresh count every 3 seconds while offline to reflect new queued actions
    const interval = setInterval(() => {
      offlineStore.getPendingCount().then(setPendingCount).catch(() => setPendingCount(0));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const pendingLabel =
    pendingCount > 0
      ? ` · ${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente`
      : '';

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: theme.colors.warning,
        color: '#1c1917',
        textAlign: 'center',
        padding: '0.5rem 1rem',
        fontSize: theme.font.sizeSm,
        fontWeight: theme.font.weightSemibold,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        borderBottom: '2px solid rgba(0,0,0,0.15)',
      }}
    >
      <span style={{ fontSize: '1rem' }}>📴</span>
      {`Hors-ligne${pendingLabel} — Les modifications seront synchronisées à la reconnexion`}
    </div>
  );
}
