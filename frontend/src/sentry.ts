import * as Sentry from '@sentry/react';

/**
 * B14 — Frontend Sentry init.
 *
 * Opt-in via `VITE_SENTRY_DSN`. When unset, all Sentry helpers stay no-op
 * so the app runs identically on a dev laptop without a Sentry account.
 *
 * Configure in nginx via `import.meta.env.VITE_SENTRY_DSN` set at build
 * time (Vite bakes VITE_ vars into the bundle).
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // Quiet — dev bring-up shouldn't shout about a missing optional dep.
    return;
  }
  Sentry.init({
    dsn,
    environment: (import.meta.env.MODE ?? 'production') as string,
    release: (import.meta.env.VITE_SENTRY_RELEASE as string | undefined) ?? undefined,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Ignore expected 401 chatter (session expired etc.).
    beforeSend(event) {
      const status = (event.contexts?.response as { status_code?: number } | undefined)
        ?.status_code;
      if (status === 401) return null;
      return event;
    },
  });
  // eslint-disable-next-line no-console
  console.info('[Sentry] enabled');
}

/** Tag the current user on all subsequent events. */
export function setSentryUser(
  user: { id: string; email?: string; role?: string; tenantId?: string } | null,
): void {
  if (!user) {
    Sentry.setUser(null);
    Sentry.setTag('tenantId', undefined as unknown as string);
    return;
  }
  Sentry.setUser({ id: user.id, email: user.email });
  if (user.role) Sentry.setTag('role', user.role);
  if (user.tenantId) Sentry.setTag('tenantId', user.tenantId);
}

export { Sentry };
