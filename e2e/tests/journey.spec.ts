import { test, expect, type Page } from '@playwright/test';

/**
 * Browser journey (admin) against a seeded stack (`prisma/seed.ts` users) :
 *   1. sign in through the login form
 *   2. create a work order through the wizard (new client, no address, details)
 *   3. find it in the list, open it in the popup, walk the tabs
 *   4. assign it to a technician through « Changer le statut », then dispatch it
 *   5. add a note, close the popup with « Retour »
 *
 * Runs in CI (job `e2e`) with the backend on a fresh Postgres and `vite preview`
 * of the production build proxying /api. Locally, without Chromium's system
 * libraries, run it inside the backend container with PW_EXECUTABLE_PATH
 * (see playwright.config.ts).
 */

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@taskmgr.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'admin123!' };

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').first().click();
  await expect(page).toHaveURL(/\/(dashboard|bons-de-travail)/, { timeout: 15_000 });
}

test.describe('Work-order journey (admin)', () => {
  test('create, open, assign, dispatch and annotate a work order', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);

    // ── 2. Wizard ───────────────────────────────────────────────────────────
    const stamp = Date.now().toString().slice(-6);
    const title = `E2E intervention ${stamp}`;
    await page.goto('/bons-de-travail/nouveau');
    await page.getByRole('button', { name: /Nouveau client/ }).click();
    await page.getByPlaceholder('Prénom', { exact: true }).fill('Élise');
    await page.getByPlaceholder('Nom', { exact: true }).fill(`Test${stamp}`);
    await page.getByRole('button', { name: /Créer et sélectionner/ }).click();
    await expect(page.getByText(`Test${stamp}`).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Suivant/ }).click();

    // Step 2 — address : a brand-new client has none, continue without.
    await page.getByRole('button', { name: /Continuer sans adresse/ }).click();
    await page.getByRole('button', { name: /Suivant/ }).click();

    // Step 3 — details
    await page.getByPlaceholder('Ex: Installation fibre optique').fill(title);
    await page.getByRole('button', { name: /Suivant/ }).click();

    // Step 4 — assignment left empty ; create.
    await page.getByRole('button', { name: /Créer le bon de travail/ }).click();
    await expect(page).toHaveURL(/\/bons-de-travail/, { timeout: 20_000 });

    // ── 3. List + popup ─────────────────────────────────────────────────────
    await page.goto('/bons-de-travail');
    await page.getByPlaceholder(/Rechercher/).first().fill(title);
    const row = page.locator('tbody tr', { hasText: title }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    const reference = (await row.locator('button').first().textContent())?.trim() ?? '';
    expect(reference).toMatch(/^[A-Z]{2,4}-\d{8}-\d{4}$/);
    await row.locator('button').first().click();

    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });
    for (const tab of ['Historique', 'Inventaire', 'Signatures', 'Pièces jointes', 'Photos', 'Détails']) {
      await page.getByRole('tab', { name: new RegExp(tab) }).click();
    }

    // ── 4. Assign then dispatch through the process ─────────────────────────
    await page.getByRole('button', { name: /Changer le statut/ }).click();
    await page.getByRole('button', { name: /^Assigner/ }).click();
    const techSelect = page.locator('select').filter({ has: page.locator('option', { hasText: /Choisir un technicien/ }) }).first();
    await techSelect.selectOption({ index: 1 });
    await page.getByRole('button', { name: /Confirmer/ }).click();
    await expect(page.getByText(/Transition « Assigner » effectuée/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /Changer le statut/ }).click();
    await page.getByRole('button', { name: /^Dispatcher/ }).click();
    const confirm = page.getByRole('button', { name: /Confirmer/ });
    if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) await confirm.click();
    await expect(page.getByText(/Transition « Dispatcher » effectuée/)).toBeVisible({ timeout: 15_000 });

    // ── 5. Note, then close with « Retour » ─────────────────────────────────
    await page.getByRole('tab', { name: /Détails/ }).click();
    const noteBox = page.locator('textarea').last();
    await noteBox.fill(`Note e2e ${stamp}`);
    await page.getByRole('button', { name: /Ajouter|Publier|Enregistrer/ }).last().click();
    await expect(page.getByText(`Note e2e ${stamp}`)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /Retour/ }).first().click();
    await expect(page.getByRole('heading', { name: title })).toBeHidden();
    await expect(row).toContainText(/Dispatch/);
  });
});
