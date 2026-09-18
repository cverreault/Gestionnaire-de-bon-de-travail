import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import * as Crypto from 'expo-crypto';
import { db } from '../db/client';
import { bufferFixes } from './fixes.repo';

export const LOCATION_TASK = 'dispatch2go-background-location';

/**
 * Headless task (ADR-017) : called by the OS with buffered locations while the
 * app is in the background. It only writes to SQLite — never calls the API
 * (no refresh from a background task, ADR-014 findings) ; the flush happens
 * from the foreground controller.
 */
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: { data?: { locations?: LocationObject[] }; error?: unknown }) => {
  if (error || !data?.locations?.length) return;
  await bufferFixes(
    db,
    data.locations.map((l) => ({
      id: Crypto.randomUUID(),
      latitude: l.coords.latitude,
      longitude: l.coords.longitude,
      accuracy: l.coords.accuracy ?? null,
      recordedAt: new Date(l.timestamp).toISOString(),
      source: 'MOBILE_BACKGROUND' as const,
    })),
  );
});
