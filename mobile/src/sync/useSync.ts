import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { ProcessSnapshot, SyncWorkOrder } from '@taskmgr/shared';
import { db } from '../db/client';
import { getMeta, getSnapshot, getWorkOrder, listWorkOrders, META } from '../db/repo';
import { useSession } from '../stores/session.store';
import { projectWorkOrder, type ProjectedWorkOrder } from './project';
import { listOps, listOpsForWorkOrder, type QueuedOp } from './queue';
import { useSyncStore } from './sync.store';
import { registerBackgroundSync, unregisterBackgroundSync } from './background-task';

const PULL_MIN_INTERVAL_MS = 60_000;
/** B65 — periodic pull while the app is open, so a « où est-il ? » request is answered within ~2 min. */
const PULL_PERIOD_MS = 2 * 60_000;

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
    useSyncStore.setState({ dbReady });
  }, [dbReady]);

  useEffect(() => {
    if (dbReady && !accessToken) void unregisterBackgroundSync();
  }, [dbReady, accessToken]);

  useEffect(() => {
    if (!dbReady || !accessToken || user?.role !== 'TECHNICIAN') return;
    const userId = user.id;
    const pull = (force = false) => {
      if (!force && Date.now() - lastPull.current < PULL_MIN_INTERVAL_MS) return;
      lastPull.current = Date.now();
      void pullNow(userId);
    };
    void getMeta(db, META.lastSyncAt).then((v) => useSyncStore.setState({ lastSyncAt: v }));
    void useSyncStore.getState().refreshCounts();
    void registerBackgroundSync();
    pull(true);
    const app = AppState.addEventListener('change', (st) => st === 'active' && pull());
    const timer = setInterval(() => { if (AppState.currentState === 'active') pull(); }, PULL_PERIOD_MS);
    const net = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(online);
      if (online) pull();
    });
    return () => {
      app.remove();
      net();
      clearInterval(timer);
    };
  }, [dbReady, accessToken, user?.id, user?.role, pullNow, setOnline]);
}

/** Local list with pending ops projected (status chips reflect queued transitions). */
export function useLocalWorkOrders(): { rows: ProjectedWorkOrder[]; loaded: boolean } {
  const version = useSyncStore((s) => s.version);
  const dbReady = useSyncStore((s) => s.dbReady);
  const user = useSession((s) => s.user);
  const [state, setState] = useState<{ rows: ProjectedWorkOrder[]; loaded: boolean }>({ rows: [], loaded: false });
  useEffect(() => {
    // Tables exist only after the migrations (root layout) : never query before.
    if (!dbReady) return;
    let alive = true;
    void (async () => {
      const [rows, ops] = await Promise.all([listWorkOrders(db), listOps(db)]);
      const me = { id: user?.id ?? '', firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' };
      const snapshots = new Map<string, ProcessSnapshot | null>();
      const projected: ProjectedWorkOrder[] = [];
      for (const wo of rows) {
        const mine = ops.filter((o) => o.workOrderId === wo.id);
        if (mine.length > 0 && wo.processDefinitionId && !snapshots.has(wo.processDefinitionId)) {
          snapshots.set(wo.processDefinitionId, await getSnapshot(db, wo.processDefinitionId));
        }
        projected.push(projectWorkOrder(wo, mine, wo.processDefinitionId ? snapshots.get(wo.processDefinitionId) ?? null : null, me));
      }
      if (alive) setState({ rows: projected, loaded: true });
    })();
    return () => {
      alive = false;
    };
  }, [dbReady, version, user?.id, user?.firstName, user?.lastName]);
  return state;
}

/** Every queued op, for the sync screen. */
export function useQueueOps(): QueuedOp[] {
  const version = useSyncStore((s) => s.version);
  const dbReady = useSyncStore((s) => s.dbReady);
  const [ops, setOps] = useState<QueuedOp[]>([]);
  useEffect(() => {
    if (!dbReady) return;
    let alive = true;
    void listOps(db).then((rows) => alive && setOps(rows));
    return () => {
      alive = false;
    };
  }, [dbReady, version]);
  return ops;
}

export interface LocalWorkOrderView {
  /** Server row with pending ops projected (null when unknown locally). */
  wo: ProjectedWorkOrder | null;
  /** Untouched server row (for expectedUpdatedAt, conflicts). */
  server: SyncWorkOrder | null;
  snapshot: ProcessSnapshot | null;
  ops: QueuedOp[];
  loaded: boolean;
}

export function useLocalWorkOrder(id: string | undefined): LocalWorkOrderView {
  const version = useSyncStore((s) => s.version);
  const dbReady = useSyncStore((s) => s.dbReady);
  const user = useSession((s) => s.user);
  const [state, setState] = useState<LocalWorkOrderView>({ wo: null, server: null, snapshot: null, ops: [], loaded: false });
  useEffect(() => {
    if (!id || !dbReady) return;
    let alive = true;
    void (async () => {
      const server = await getWorkOrder(db, id);
      const snapshot = await getSnapshot(db, server?.processDefinitionId);
      const ops = await listOpsForWorkOrder(db, id);
      const me = { id: user?.id ?? '', firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' };
      if (alive) setState({ wo: server ? projectWorkOrder(server, ops, snapshot, me) : null, server, snapshot, ops, loaded: true });
    })();
    return () => {
      alive = false;
    };
  }, [id, dbReady, version, user?.id, user?.firstName, user?.lastName]);
  return state;
}
