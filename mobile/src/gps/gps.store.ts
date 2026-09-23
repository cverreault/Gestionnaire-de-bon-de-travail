import { create } from 'zustand';
import * as Location from 'expo-location';
import type { TrackingDecision } from './rules';

/** B57 — last fix known to the app, attached to every API request (X-Client-Location). */
export interface LastFix {
  lat: number;
  lng: number;
  accuracy?: number;
  recordedAt: string;
}
const FIX_MAX_AGE_MS = 5 * 60 * 1000;
const FIX_REFRESH_AFTER_MS = 60 * 1000;

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
  lastFix: LastFix | null;
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
  lastFix: null,
  set: (p) => set(p),
}));

export function rememberFix(l: { coords: { latitude: number; longitude: number; accuracy: number | null }; timestamp: number }): void {
  useGpsStore.getState().set({ lastFix: { lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy ?? undefined, recordedAt: new Date(l.timestamp).toISOString() } });
}

/**
 * Fix to put on the next request : the tracked one when fresh, else the OS
 * cached position (fast, no new GPS acquisition). Null when nothing usable
 * in the last 5 minutes or no permission — the request goes out anyway.
 */
export async function currentFixForHeader(): Promise<LastFix | null> {
  const { lastFix } = useGpsStore.getState();
  const age = lastFix ? Date.now() - Date.parse(lastFix.recordedAt) : Infinity;
  if (lastFix && age < FIX_REFRESH_AFTER_MS) return lastFix;
  try {
    const l = await Location.getLastKnownPositionAsync({ maxAge: FIX_MAX_AGE_MS });
    if (l) {
      rememberFix(l);
      return useGpsStore.getState().lastFix;
    }
  } catch {
    // permission not granted yet : fall through
  }
  return lastFix && age < FIX_MAX_AGE_MS ? lastFix : null;
}
