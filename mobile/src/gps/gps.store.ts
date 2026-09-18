import { create } from 'zustand';
import type { TrackingDecision } from './rules';

interface GpsState {
  /** Server-side consent (preferences.gps.enabled). */
  serverConsent: boolean;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  /** Set after a 403 on the batch endpoint ; cleared when the consent is switched on again. */
  consentRevoked: boolean;
  mode: TrackingDecision;
  buffered: number;
  lastFlushAt: string | null;
  error: string | null;
  set: (p: Partial<Omit<GpsState, 'set'>>) => void;
}

export const useGpsStore = create<GpsState>((set) => ({
  serverConsent: false,
  foregroundGranted: false,
  backgroundGranted: false,
  consentRevoked: false,
  mode: 'off',
  buffered: 0,
  lastFlushAt: null,
  error: null,
  set: (p) => set(p),
}));
