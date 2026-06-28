import { test, expect } from '@playwright/test';
import { login, adminCredentials } from './helpers/auth';

/**
 * E2E smoke (C5) — admin can log in and reach the main pages.
 *
 * Cheap fast canary: if it goes red the rest of the suite is doomed
 * anyway. Hits the dashboard, work orders list, audit page and back.
 */
test.describe('Admin smoke navigation', () => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    'E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD not set — skip',
  );

  test('logs in and navigates dashboard → BT → audit', async ({ page }) => {
    const { email, password } = adminCredentials();

    await login(page, email, password);

    // We land on the dashboard or the work-orders page — both are valid
    // for an admin. Just assert the sidebar is rendered.
    await expect(page.locator('a[href="/dashboard"]')).toBeVisible();

    // Dashboard
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard$/);

    // Work orders list
    await page.goto('/bons-de-travail');
    await expect(page).toHaveURL(/\/bons-de-travail$/);
    // Either we have a "Créer" button or the empty state — both prove
    // the page rendered without falling over.
    const createBtn = page.getByRole('link', { name: /Créer|Create/i });
    const empty = page.getByText(/Aucun bon de travail|No work orders/i);
    await expect(createBtn.or(empty)).toBeVisible();

    // Audit page (admin only) — gated by /audit route
    await page.goto('/audit');
    await expect(page).toHaveURL(/\/audit$/);
    await expect(page.getByRole('heading', { name: /Audit/i })).toBeVisible();
  });
});
