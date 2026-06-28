import { test, expect } from '@playwright/test';
import { login, adminCredentials, techCredentials } from './helpers/auth';

/**
 * E2E flow (C5) — original plan §C5 scenario.
 *
 *   admin    → create a BT
 *   admin    → assign it to a technician
 *   admin    → dispatch
 *   tech     → transition through EN_ROUTE → IN_PROGRESS → COMPLETED_POSITIVE
 *
 * The test does NOT clean up the BT it creates — the audit table is
 * append-only by design and the BT itself is part of the visible
 * history. Run on a dev/staging DB you don't mind seeding.
 *
 * Requires E2E_ADMIN_* + E2E_TECH_* env vars. Skipped otherwise (the
 * smoke spec in smoke-admin-nav.spec.ts still runs).
 */

test.describe('Full BT lifecycle through 2 personas', () => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD ||
      !process.env.E2E_TECH_EMAIL || !process.env.E2E_TECH_PASSWORD,
    'Admin + technician E2E creds required — skip',
  );

  // A unique-per-run title so we can find our BT in the list.
  const stamp = Date.now().toString(36);
  const TITLE = `E2E BT ${stamp}`;

  test('admin creates + assigns + dispatches, tech transitions to completed', async ({ page }) => {
    const admin = adminCredentials();
    const tech = techCredentials()!;

    // ─── Admin: log in and create a BT ──────────────────────────────────────
    await login(page, admin.email, admin.password);

    await page.goto('/bons-de-travail/nouveau');

    // Title field — react-hook-form, look it up by label text.
    await page.getByLabel(/Titre|Title/i).first().fill(TITLE);

    // Description (optional but informative for diff in audit timeline).
    const desc = page.getByLabel(/Description/i).first();
    if (await desc.count()) await desc.fill('E2E lifecycle smoke');

    // Pick the first available task type — the wizard requires it. The
    // dropdown may not be present if defaults aren't seeded; skip if so.
    const taskTypeSelect = page.locator('select').first();
    if (await taskTypeSelect.isVisible()) {
      const options = await taskTypeSelect.locator('option').allTextContents();
      const firstReal = options.find((o) => o && !/Choisir|Select/i.test(o));
      if (firstReal) await taskTypeSelect.selectOption({ label: firstReal });
    }

    await page.getByRole('button', { name: /Créer|Create/i }).first().click();

    // Lands on the new BT detail page.
    await expect(page).toHaveURL(/\/bons-de-travail\/[\da-f-]+$/i, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

    // ─── Admin: assign + dispatch in one click ──────────────────────────────
    // The header surface exposes the "Assigner et dispatcher" button as a
    // shortcut on a freshly-created BT. If it is not visible, fall back to
    // the dropdown transition path.
    const assignAndDispatch = page.getByRole('button', { name: /Assigner.*dispatcher/i });
    if (await assignAndDispatch.count()) {
      await assignAndDispatch.click();
      // Modal with technician picker
      const techSelect = page.locator('select').filter({ hasText: /technicien|technician/i }).first();
      await techSelect.selectOption({ label: new RegExp(tech.email, 'i') });
      await page.getByRole('button', { name: /Confirmer|Confirm/i }).click();
    } else {
      // Use the per-transition button bar (slower path).
      await page.getByRole('button', { name: /Assigner/i }).first().click();
      const techSelect = page.locator('select').first();
      await techSelect.selectOption({ label: new RegExp(tech.email, 'i') });
      await page.getByRole('button', { name: /Confirmer|Confirm/i }).click();
      // Then dispatch
      await page.getByRole('button', { name: /Dispatcher|Dispatch/i }).first().click();
    }

    // BT is now in DISPATCHED — wait for the badge/text to reflect it.
    await expect(page.getByText(/Dispatché|Réparti|Dispatched/i).first()).toBeVisible({ timeout: 10_000 });

    // Capture the BT id for the tech to revisit it (path is /bons-de-travail/:id).
    const adminUrl = page.url();
    const woId = adminUrl.split('/').pop()!;

    // ─── Switch persona: tech logs in ───────────────────────────────────────
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await login(page, tech.email, tech.password);

    // Tech opens the BT from their dedicated tech route.
    await page.goto(`/mes-bons/${woId}`);
    await expect(page.getByText(new RegExp(TITLE.replace(/\s+/g, '\\s+')))).toBeVisible();

    // ─── Tech: EN_ROUTE → IN_PROGRESS → COMPLETED_POSITIVE ──────────────────
    await page.getByRole('button', { name: /En route/i }).first().click();
    await expect(page.getByText(/En route/i).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Début|Start/i }).first().click();
    await expect(page.getByText(/En cours|In progress/i).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Terminer.*positif/i }).first().click();
    // Some processes ask for completion notes — fill if visible.
    const notes = page.getByLabel(/Notes/i);
    if (await notes.count()) await notes.first().fill('E2E completed');
    const confirm = page.getByRole('button', { name: /Confirmer|Confirm/i });
    if (await confirm.count()) await confirm.first().click();

    await expect(page.getByText(/Terminé.*positif|Completed/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
