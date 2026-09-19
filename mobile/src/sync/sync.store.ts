import { create } from 'zustand';
import { db } from '../db/client';
import { META, ensureOwner, getMeta } from '../db/repo';
import { pullSync } from '../api/endpoints';
import { pullAll } from './apply-pull';
import { drain, retryOp } from './drain';
import { countOps, deleteOp, enqueue, type OpKind, type OpPayload, type QueueCounts } from './queue';
import { httpSender } from './senders';
import * as Crypto from 'expo-crypto';

interface SyncState {
  /** True once the SQLite migrations ran ; local hooks stay idle before that. */
  dbReady: boolean;
  /** Bumped after every applied pull / queue change so local hooks re-read. */
  version: number;
  syncing: boolean;
  lastSyncAt: string | null;
  error: string | null;
  online: boolean;
  counts: QueueCounts;
  setOnline: (online: boolean) => void;
  bump: () => void;
  refreshCounts: () => Promise<void>;
  /** Drain the queue then pull (single-flight) ; safe to call often. */
  pullNow: (userId: string) => Promise<void>;
  /** Queue an op (offline-first) and try to drain right away. */
  enqueueOp: (userId: string, workOrderId: string, kind: OpKind, payload: OpPayload, id?: string) => Promise<string>;
  retryOp: (userId: string, id: string) => Promise<void>;
  discardOp: (id: string) => Promise<void>;
}

let inFlight: Promise<void> | null = null;

async function pullOnly(userId: string, set: (p: Partial<SyncState>) => void, get: () => SyncState) {
  const switched = await ensureOwner(db, userId);
  const cursor = switched ? null : await getMeta(db, META.cursor);
  await pullAll(db, (c, limit) => pullSync(c, limit), cursor);
  set({ lastSyncAt: await getMeta(db, META.lastSyncAt), version: get().version + 1 });
}

export const useSyncStore = create<SyncState>((set, get) => ({
  dbReady: false,
  version: 0,
  syncing: false,
  lastSyncAt: null,
  error: null,
  online: true,
  counts: { pending: 0, failed: 0, conflict: 0 },
  setOnline: (online) => set({ online }),
  bump: () => set({ version: get().version + 1 }),

  async refreshCounts() {
    set({ counts: await countOps(db) });
  },

  pullNow(userId) {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      set({ syncing: true, error: null });
      try {
        await ensureOwner(db, userId);
        // Queue first (ADR-016 §4) : what the technician did wins over what the pull would overwrite.
        const drained = await drain(db, httpSender, () => pullOnly(userId, set, get));
        await pullOnly(userId, set, get);
        if (drained.stopped) set({ error: 'offline' });
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err), version: get().version + 1 });
      } finally {
        set({ syncing: false, counts: await countOps(db) });
        inFlight = null;
      }
    })();
    return inFlight;
  },

  async enqueueOp(userId, workOrderId, kind, payload, id = Crypto.randomUUID()) {
    await enqueue(db, { id, workOrderId, kind, payload });
    set({ version: get().version + 1, counts: await countOps(db) });
    if (get().online) void get().pullNow(userId);
    return id;
  },

  async retryOp(userId, id) {
    await retryOp(db, id);
    set({ version: get().version + 1, counts: await countOps(db) });
    void get().pullNow(userId);
  },

  async discardOp(id) {
    await deleteOp(db, id);
    set({ version: get().version + 1, counts: await countOps(db) });
  },
}));
