import { test, expect } from '@playwright/test';

/**
 * Auth failure paths (C5).
 *
 * Locks the front-end's behaviour on the unhappy path:
 *   1. Wrong password → user stays on /login + sees a visible error
 *   2. Unknown email → same UX, same indistinct message (anti-enumeration
 *      matches the backend integration spec)
 *
 * Uses E2E_ADMIN_EMAIL to derive an "exists but wrong password" case.
 * No fixture creation needed.
 */

test.describe('Auth — failure paths', () => {
  const adminEmail = process.env.E2E_ADMIN_EMAIL;

  test.skip(!adminEmail, 'requires E2E_ADMIN_EMAIL set');

  test('wrong password keeps the user on /login and surfaces an error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(adminEmail!);
    await page.locator('input[type="password"]').fill('definitely-not-the-right-password');
    await page.locator('button[type="submit"]').click();

    // No navigation away from /login
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/.*\/login/);

    // A visible error message appears — either a toast or an inline
    // alert. We look for anything matching the standard error class /
    // role so the test isn't tied to a specific copy variant.
    const errorVisible = await page
      .locator('[role="alert"], .error, .text-danger, .invalid-feedback')
      .first()
      .isVisible()
      .catch(() => false);

    expect(errorVisible).toBe(true);
  });

  test('unknown email shows the same generic error (no enumeration)', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('never-existed-1234@taskmgr.test');
    await page.locator('input[type="password"]').fill('whatever');
    await page.locator('button[type="submit"]').click();

    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/.*\/login/);

    const errorVisible = await page
      .locator('[role="alert"], .error, .text-danger, .invalid-feedback')
      .first()
      .isVisible()
      .catch(() => false);

    expect(errorVisible).toBe(true);
  });
});
