import { test, expect } from '@playwright/test';

/**
 * TaskMgr E2E smoke tests (B18).
 *
 * These verify that the critical HTTP boundaries respond as expected. They
 * don't need any real user account — they hit unauthenticated routes and
 * check for the right status codes.
 *
 * Add a fixture (login with real creds) later when we're happy with the
 * signal from the smoke pass.
 */

test.describe('Public HTTP surface', () => {
  test('health endpoint is 200', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
  });

  // NOTE: request-based rather than page.goto() — the CI/dev host may lack
  // Chromium's system libraries (libgbm & co, needs `sudo npx playwright
  // install-deps chromium`). The SPA is client-rendered so we assert on the
  // shell + the JS bundle being served; real DOM assertions belong in the
  // browser-based journey tests once deps are installed.
  test('login page serves the SPA shell', async ({ request }) => {
    const res = await request.get('/login');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('<div id="root"');
    const src = body.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    expect(src, 'SPA bundle referenced in HTML').toBeTruthy();
    const bundle = await request.get(src!);
    expect(bundle.status()).toBe(200);
  });

  test('anonymous access to /api/v1/* returns 401', async ({ request }) => {
    const paths = [
      '/api/v1/work-orders',
      '/api/v1/clients',
      '/api/v1/webhooks',
      '/api/v1/alerts',
      '/api/v1/recurring-work-orders',
    ];
    for (const p of paths) {
      const res = await request.get(p);
      expect(res.status(), `${p} should be 401`).toBe(401);
    }
  });

  test('anonymous access to internal routes returns 401', async ({ request }) => {
    const paths = [
      '/api/work-orders',
      '/api/tenant/api-keys',
      '/api/tenant/webhooks',
      '/api/tenant/alerts',
      '/api/recurring-work-orders',
      '/api/dispatch-map/snapshot',
      '/api/search',
    ];
    for (const p of paths) {
      const res = await request.get(p);
      expect(res.status(), `${p} should be 401`).toBe(401);
    }
  });

  test('bad login credentials return 401', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: 'ghost@nowhere.test', password: 'bad-password' },
    });
    expect(res.status()).toBe(401);
  });

  test('login endpoint returns 400 for malformed body', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: 'not-an-email' },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('Static frontend assets', () => {
  test('root serves the SPA', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBeLessThan(400);
    const body = await res.text();
    expect(body).toContain('<div id="root"');
  });
});
