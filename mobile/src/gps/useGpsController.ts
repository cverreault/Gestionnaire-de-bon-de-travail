import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useSession } from '../stores/session.store';
import { useSyncStore } from '../sync/sync.store';
import { useLocalWorkOrders } from '../sync/useSync';
import { useGpsStore } from './gps.store';
import { decideTracking } from './rules';
import { applyTracking, flushFixes, refreshCount } from './tracker';

const FLUSH_MIN_INTERVAL_MS = 60_000;

/** Re-evaluates the OS permission state (cheap, no prompt). */
export async function refreshPermissions(): Promise<void> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = fg.granted ? await Location.getBackgroundPermissionsAsync() : { granted: false };
  useGpsStore.getState().set({ foregroundGranted: fg.granted, backgroundGranted: bg.granted });
}

/**
 * Mounted once in the root layout (B38.8). Starts / stops collection from the
 * pure decision (consent × permission × active work order) and flushes the
 * buffer on foreground, after each sync, and at most every minute.
 */
export function useGpsController(dbReady: boolean): void {
  const { accessToken, user } = useSession();
  const { rows } = useLocalWorkOrders();
  const syncVersion = useSyncStore((s) => s.version);
  const online = useSyncStore((s) => s.online);
  const { serverConsent, foregroundGranted, backgroundGranted, consentRevoked, set } = useGpsStore();
  const lastFlush = useRef(0);

  // Server consent comes with the user profile (preferences.gps.enabled).
  useEffect(() => {
    set({ serverConsent: !!user?.preferences?.gps?.enabled });
  }, [user?.preferences?.gps?.enabled, set]);

  useEffect(() => {
    if (!dbReady || !accessToken || user?.role !== 'TECHNICIAN') {
      void applyTracking('off');
      return;
    }
    void refreshPermissions();
    void refreshCount();
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      void refreshPermissions();
      if (Date.now() - lastFlush.current > FLUSH_MIN_INTERVAL_MS) {
        lastFlush.current = Date.now();
        void flushFixes();
      }
    });
    return () => sub.remove();
  }, [dbReady, accessToken, user?.role]);

  useEffect(() => {
    if (!dbReady || !accessToken || user?.role !== 'TECHNICIAN') return;
    const mode = decideTracking({ serverConsent, foregroundGranted, backgroundGranted, consentRevoked, statuses: rows.map((w) => w.status) });
    void applyTracking(mode);
  }, [dbReady, accessToken, user?.role, serverConsent, foregroundGranted, backgroundGranted, consentRevoked, rows]);

  // Flush after every sync when online (piggybacks on the radio being up).
  useEffect(() => {
    if (!dbReady || !accessToken || !online) return;
    lastFlush.current = Date.now();
    void flushFixes();
  }, [dbReady, accessToken, online, syncVersion]);
}
