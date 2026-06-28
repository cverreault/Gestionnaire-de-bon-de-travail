/// <reference lib="webworker" />
/**
 * Custom Service Worker (B1.3 frontend).
 *
 * Owned: precache (workbox), API NetworkFirst cache, Web Push receive +
 * notification click. Replaces the auto-generated SW that vite-plugin-pwa
 * used to ship; the precache manifest is still injected at build time
 * via self.__WB_MANIFEST.
 *
 * Why we own it: handling `push` events requires a hand-written
 * `addEventListener('push', ...)`; the generateSW strategy doesn't
 * expose a hook for that. injectManifest is the documented escape
 * hatch.
 */

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// ── Precache (manifest injected at build) ────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST);

// ── /api/ NetworkFirst (mirrors the previous generateSW config) ─────────────
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 })],
  }),
);

// ── Web Push ─────────────────────────────────────────────────────────────────

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {};
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    // Body wasn't JSON — fall back to a generic notification.
    payload = { title: 'TaskMgr', body: event.data?.text() ?? '' };
  }

  const title = payload.title ?? 'TaskMgr';
  const options: NotificationOptions = {
    body: payload.body,
    badge: '/pwa-192x192.png',
    icon: '/pwa-192x192.png',
    data: { url: payload.url ?? '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl = (event.notification.data?.url as string | undefined) ?? '/';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus an existing tab if we already have one open.
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            await client.navigate(targetUrl);
            return client.focus();
          } catch {
            // SecurityError when the tab is cross-origin — fall through to openWindow.
          }
        }
      }
      // Otherwise open a new tab on the target URL.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

// ── Skip waiting (autoUpdate) ────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
