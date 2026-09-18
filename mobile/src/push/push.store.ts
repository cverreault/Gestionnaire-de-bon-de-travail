import { create } from 'zustand';

interface PushState {
  /** Expo push token (ExponentPushToken[...]) or null when unavailable. */
  token: string | null;
  permission: 'granted' | 'denied' | 'undetermined';
  /** Why no token : missing EAS project id (dev), permission denied, native error. */
  reason: string | null;
  set: (p: Partial<Omit<PushState, 'set'>>) => void;
}

export const usePushStore = create<PushState>((set) => ({ token: null, permission: 'undetermined', reason: null, set: (p) => set(p) }));
