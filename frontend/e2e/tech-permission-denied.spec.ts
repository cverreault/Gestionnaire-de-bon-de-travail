import { test, expect } from '@playwright/test';
import { login, techCredentials } from './helpers/auth';

/**
 * Permission denial in the UI (C5).
 *
 * Backend RBAC is unit-tested (roles-matrix.spec.ts) and now
 * integration-tested (C4). This spec covers the front-end gate:
 * once logged in as TECHNICIAN, navigating to admin-only paths
 * either redirects to /mes-bons (the tech home) or shows the
 * NotFound page — depending on AdminRoute's behaviour. Either is
 * an acceptable "denied" UX, but the user must NOT see admin
 * content.
 *
 * Skip when no tech credentials are provided (mirrors the lifecycle
 * spec's policy).
 */

const ADMIN_ONLY_PATHS: Array<{ path: string; adminMarker: RegExp }> = [
  { path: '/dashboard',            adminMarker: /tableau de bord|dashboard/i },
  { path: '/utilisateurs',         adminMarker: /utilisateurs|users/i },
  { path: '/parametres',           adminMarker: /paramètres|settings/i },
  { path: '/audit',                adminMarker: /audit/i },
  { path: '/sauvegarde',           adminMarker: /sauvegarde|backup/i },
  { path: '/rapports',             adminMarker: /rapports|reports/i },
  { path: '/super-admin',          adminMarker: /super.?admin|configuration/i },
];

test.describe('Permission denial UI — TECHNICIAN', () => {
  const tech = techCredentials();
  test.skip(!tech, 'requires E2E_TECH_EMAIL / E2E_TECH_PASSWORD set');

  test('admin paths are inaccessible — no admin content rendered', async ({ page }) => {
    await login(page, tech!.email, tech!.password);
    // After tech login, AppLayout redirects to /mes-bons.
    await expect(page).toHaveURL(/\/mes-bons/);

    for (const { path, adminMarker } of ADMIN_ONLY_PATHS) {
      await page.goto(path);
      // Either the URL was rewritten away from the admin path
      // (redirect) OR the page rendered a NotFound. Both are
      // acceptable; what's NOT acceptable is the admin marker
      // appearing in the visible DOM.
      const url = page.url();
      const onAdminPath = new RegExp(path.replace(/\//g, '\\/')).test(url);
      if (onAdminPath) {
        const bodyText = await page.locator('body').innerText();
        const leaked = adminMarker.test(bodyText);
        expect(leaked, `Tech saw admin content at ${path}: ${bodyText.slice(0, 80)}`).toBe(false);
      }
      // else: redirect happened — that's a pass.
    }
  });
});
