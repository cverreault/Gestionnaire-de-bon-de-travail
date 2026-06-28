/**
 * Browser-side Web Push registration helper (B1.3).
 *
 * Talks to the SW + PushManager + backend in a single async flow so the
 * UI just calls enablePush() / disablePush() / getPushState().
 *
 * Error model
 *   - 'unsupported'        → browser doesn't expose PushManager
 *   - 'permission-denied'  → user said no in the browser prompt
 *   - 'server-disabled'    → backend doesn't have VAPID keys (404 on
 *                            vapid-public-key)
 *   - thrown Error otherwise
 */

import {
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
} from '../services/notifications.service';

export type PushState = 'unsupported' | 'denied' | 'granted' | 'default' | 'unsubscribed';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Returns the current state without prompting the user. */
export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (Notification.permission === 'granted' && sub) return 'granted';
  if (Notification.permission === 'granted') return 'unsubscribed';
  return 'default';
}

/**
 * Triggers the permission prompt if needed, subscribes the browser to
 * push, and sends the subscription to the backend.
 */
export async function enablePush(): Promise<void> {
  if (!isPushSupported()) throw new Error('unsupported');

  // 1. Make sure the SW is ready.
  const registration = await navigator.serviceWorker.ready;

  // 2. Fetch the server's public key. If the server isn't configured
  //    (404), surface a recognisable error so the UI can show a hint
  //    instead of a generic failure.
  let publicKey: string;
  try {
    const res = await getVapidPublicKey();
    publicKey = ((res.data?.data ?? res.data) as { publicKey: string }).publicKey;
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 404) throw new Error('server-disabled');
    throw err;
  }

  // 3. Prompt + subscribe via PushManager.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission-denied');

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  // 4. Tell the backend.
  const raw = subscription.toJSON();
  await subscribePush({
    endpoint: raw.endpoint!,
    keys: { p256dh: raw.keys!.p256dh, auth: raw.keys!.auth },
    userAgent: navigator.userAgent,
  });
}

/** Unsubscribes the browser AND removes the backend record. */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;

  try {
    await unsubscribePush(sub.endpoint);
  } catch {
    // 404 here is fine — backend already forgot it.
  }
  await sub.unsubscribe();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * PushManager.subscribe wants the public key as a Uint8Array, not the
 * URL-safe base64 string the server returns. Standard adapter.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
