import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { ProcessSnapshot, SyncWorkOrder } from '@taskmgr/shared';
import { db } from '../db/client';
import { getMeta, getSnapshot, getWorkOrder, listWorkOrders, META } from '../db/repo';
import { useSession } from '../stores/session.store';
import { useSyncStore } from './sync.store';

const PULL_MIN_INTERVAL_MS = 60_000;

/**
 * Pull triggers (B38.4): session ready, app back to foreground, network back.
 * Mounted once in the root layout.
 */
export function useSyncScheduler(dbReady: boolean): void {
  const { accessToken, user } = useSession();
  const pullNow = useSyncStore((s) => s.pullNow);
  const setOnline = useSyncStore((s) => s.setOnline);
  const lastPull = useRef(0);

  useEffect(() => {
    if (!dbReady || !accessToken || user?.role !== 'TECHNICIAN') return;
    const userId = user.id;
    const pull = (force = false) => {
      if (!force && Date.now() - lastPull.current < PULL_MIN_INTERVAL_MS) return;
      lastPull.current = Date.now();
      void pullNow(userId);
    };
    void getMeta(db, META.lastSyncAt).then((v) => useSyncStore.setState({ lastSyncAt: v }));
    pull(true);
    const app = AppState.addEventListener('change', (st) => st === 'active' && pull());
    const net = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(online);
      if (online) pull();
    });
    return () => {
      app.remove();
      net();
    };
  }, [dbReady, accessToken, user?.id, user?.role, pullNow, setOnline]);
}

/** Local list, re-read after every pull. */
export function useLocalWorkOrders(): { rows: SyncWorkOrder[]; loaded: boolean } {
  const version = useSyncStore((s) => s.version);
  const [state, setState] = useState<{ rows: SyncWorkOrder[]; loaded: boolean }>({ rows: [], loaded: false });
  useEffect(() => {
    let alive = true;
    void listWorkOrders(db).then((rows) => alive && setState({ rows, loaded: true }));
    return () => {
      alive = false;
    };
  }, [version]);
  return state;
}

export function useLocalWorkOrder(id: string | undefined): { wo: SyncWorkOrder | null; snapshot: ProcessSnapshot | null; loaded: boolean } {
  const version = useSyncStore((s) => s.version);
  const [state, setState] = useState<{ wo: SyncWorkOrder | null; snapshot: ProcessSnapshot | null; loaded: boolean }>({ wo: null, snapshot: null, loaded: false });
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void (async () => {
      const wo = await getWorkOrder(db, id);
      const snapshot = await getSnapshot(db, wo?.processDefinitionId);
      if (alive) setState({ wo, snapshot, loaded: true });
    })();
    return () => {
      alive = false;
    };
  }, [id, version]);
  return state;
}
