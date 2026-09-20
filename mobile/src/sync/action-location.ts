import * as Location from 'expo-location';
import type { ClientLocation } from '@taskmgr/shared';
import { logEvent } from '../diag/log';

/**
 * B45 — best-effort position at the moment of an action (transition, note,
 * photo, signature, part, form). Only when the foreground permission is
 * already granted (never prompts here) ; a fresh fix with a short timeout,
 * else the last known one, else null. Never throws.
 */
export async function captureActionLocation(timeoutMs = 4000): Promise<ClientLocation | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    const pos = fresh ?? (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }));
    if (!pos) return null;
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      ...(pos.coords.accuracy != null ? { accuracy: Math.round(pos.coords.accuracy) } : {}),
      recordedAt: new Date(pos.timestamp || Date.now()).toISOString(),
    };
  } catch (err) {
    logEvent('gps', 'action location failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
