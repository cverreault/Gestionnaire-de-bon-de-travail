import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { ApiError } from '../api/client';
import { postLocationBatch } from '../api/endpoints';
import { db } from '../db/client';
import { bufferFixes, countFixes, deleteFixes, nextBatch } from './fixes.repo';
import { rememberFix, useGpsStore } from './gps.store';
import { logEvent } from '../diag/log';
import { LOCATION_TASK } from './location-task';
import type { TrackingDecision } from './rules';

/** ~ every 30 s or 50 m, balanced accuracy : enough for a dispatcher map, gentle on the battery. */
const OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 30_000,
  distanceInterval: 50,
  deferredUpdatesInterval: 60_000,
  showsBackgroundLocationIndicator: true,
  pausesUpdatesAutomatically: false,
  foregroundService: {
    notificationTitle: 'Dispatch2Go',
    notificationBody: 'Position partagée avec la répartition pendant un bon de travail actif.',
    notificationColor: '#208AEF',
  },
};

let foregroundSub: Location.LocationSubscription | null = null;
let current: TrackingDecision = 'off';

export async function applyTracking(mode: TrackingDecision): Promise<void> {
  if (mode === current) return;
  await stopAll();
  if (mode === 'background') {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, OPTIONS);
  } else if (mode === 'foreground') {
    foregroundSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 50 },
      (l) =>
        (rememberFix(l), void bufferFixes(db, [{
          id: Crypto.randomUUID(), latitude: l.coords.latitude, longitude: l.coords.longitude,
          accuracy: l.coords.accuracy ?? null, recordedAt: new Date(l.timestamp).toISOString(), source: 'MOBILE_FOREGROUND',
        }]).then(() => void refreshCount())),
    );
  }
  current = mode;
  logEvent('gps', `tracking ${mode}`);
  useGpsStore.getState().set({ mode });
}

async function stopAll(): Promise<void> {
  foregroundSub?.remove();
  foregroundSub = null;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    // Task not registered yet : nothing to stop.
  }
  current = 'off';
}

export async function refreshCount(): Promise<void> {
  useGpsStore.getState().set({ buffered: await countFixes(db) });
}

let flushing = false;

/** Sends buffered fixes in batches of 100 ; a 403 means consent was revoked on the web profile. */
export async function flushFixes(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (;;) {
      const batch = await nextBatch(db);
      if (batch.length === 0) break;
      try {
        await postLocationBatch(batch.map(({ id: _id, ...f }) => f), Crypto.randomUUID());
      } catch (err) {
        logEvent('gps', `flush failed: ${err instanceof Error ? err.message : String(err)}`);
        if (err instanceof ApiError && err.status === 403) {
          useGpsStore.getState().set({ consentRevoked: true, error: err.message });
          await applyTracking('off');
          await deleteFixes(db, batch.map((f) => f.id));
          continue;
        }
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          // Malformed batch (should not happen) : drop it rather than loop forever.
          await deleteFixes(db, batch.map((f) => f.id));
          continue;
        }
        useGpsStore.getState().set({ error: err instanceof Error ? err.message : String(err) });
        break;
      }
      await deleteFixes(db, batch.map((f) => f.id));
      useGpsStore.getState().set({ lastFlushAt: new Date().toISOString(), error: null });
    }
  } finally {
    flushing = false;
    await refreshCount();
  }
}
