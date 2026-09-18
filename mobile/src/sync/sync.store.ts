import { create } from 'zustand';
import { db } from '../db/client';
import { META, ensureOwner, getMeta } from '../db/repo';
import { pullSync } from '../api/endpoints';
import { pullAll } from './apply-pull';

interface SyncState {
  /** Bumped after every applied pull so local hooks re-read. */
  version: number;
  syncing: boolean;
  lastSyncAt: string | null;
  error: string | null;
  online: boolean;
  setOnline: (online: boolean) => void;
  bump: () => void;
  /** Single-flight delta pull for the given user ; safe to call often. */
  pullNow: (userId: string) => Promise<void>;
}

let inFlight: Promise<void> | null = null;

export const useSyncStore = create<SyncState>((set, get) => ({
  version: 0,
  syncing: false,
  lastSyncAt: null,
  error: null,
  online: true,
  setOnline: (online) => set({ online }),
  bump: () => set({ version: get().version + 1 }),

  pullNow(userId) {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      set({ syncing: true, error: null });
      try {
        const switched = await ensureOwner(db, userId);
        const cursor = switched ? null : await getMeta(db, META.cursor);
        await pullAll(db, (c, limit) => pullSync(c, limit), cursor);
        set({ lastSyncAt: await getMeta(db, META.lastSyncAt), version: get().version + 1 });
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err), version: get().version + 1 });
      } finally {
        set({ syncing: false });
        inFlight = null;
      }
    })();
    return inFlight;
  },
}));
