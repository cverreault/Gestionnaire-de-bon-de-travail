import { useEffect, useRef } from 'react';
import { recordMyLocation } from '../services/locations.service';
import { useUserPreferences } from './useUserPreferences';

/**
 * Background GPS tracker for opted-in technicians (B5.3).
 *
 * Lifecycle:
 *   1. Reads `preferences.gps.enabled` from /me/preferences (cached
 *      by useUserPreferences).
 *   2. When enabled, calls navigator.geolocation.watchPosition.
 *   3. Throttles uploads to at most one per 25 s — the dispatcher map
 *      doesn't need sub-second precision and we don't want to flood
 *      the throttler (60/min cap).
 *   4. When the preference flips OFF or the component unmounts,
 *      clears the watcher.
 *
 * The OS-level location permission is requested by the browser on the
 * first watchPosition call. Denial silently disables tracking for the
 * session — opt-in remains set, the user can re-enable in OS settings.
 */
const UPLOAD_INTERVAL_MS = 25_000;

export function useGpsTracker(): void {
  const { data: preferences } = useUserPreferences();
  const lastUploadAtRef = useRef<number>(0);

  const enabled =
    !!preferences &&
    typeof preferences.gps === 'object' &&
    preferences.gps !== null &&
    (preferences.gps as { enabled?: boolean }).enabled === true;

  useEffect(() => {
    if (!enabled) return;

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      // No geolocation API (very old browser / SSR) — bail out silently.
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastUploadAtRef.current < UPLOAD_INTERVAL_MS) return;
        lastUploadAtRef.current = now;

        recordMyLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy)
            ? pos.coords.accuracy
            : null,
        }).catch(() => {
          // Swallow errors — the next watchPosition tick retries
          // automatically. We don't want a transient 503 to crash
          // the tech's session.
        });
      },
      () => {
        // Permission denied or position unavailable. The browser will
        // not call success again until the user grants permission, so
        // there's nothing to do here beyond logging.
      },
      {
        enableHighAccuracy: false,
        maximumAge: 30_000,
        timeout: 20_000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);
}
