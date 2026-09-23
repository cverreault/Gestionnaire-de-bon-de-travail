import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { postLocationBatch } from '../api/endpoints';
import { rememberFix } from './gps.store';
import { logEvent } from '../diag/log';

let answering = false;

/**
 * B57/B65 — the dispatcher asked « où est-il ? » (push, or `locateRequested`
 * in the sync pull when push is not configured) : send a fresh fix now.
 * Silent without permission or signal ; the dispatcher keeps the last position.
 */
export async function answerLocateRequest(): Promise<void> {
  if (answering) return;
  answering = true;
  try {
    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    rememberFix(l);
    await postLocationBatch([{ latitude: l.coords.latitude, longitude: l.coords.longitude, accuracy: l.coords.accuracy ?? null, recordedAt: new Date(l.timestamp).toISOString(), source: 'MOBILE_FOREGROUND' }], Crypto.randomUUID());
    logEvent('gps', 'locate request answered');
  } catch (err) {
    logEvent('gps', `locate request not answered: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    answering = false;
  }
}
