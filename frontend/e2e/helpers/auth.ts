import type { Page } from '@playwright/test';

/**
 * Log a user in via the visible login form. The form is plain HTML
 * (react-hook-form under the hood) and exposes the typed inputs by
 * native attributes — selectors stay the same as long as the form
 * markup keeps a single email/password pair.
 *
 * After submit, waits for navigation away from /login. The destination
 * varies by role (admin → /dashboard, tech → /mes-bons) so the caller
 * doesn't get an opinion enforced here.
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/^(?!.*\/login).*$/, { timeout: 10_000 });
}

export interface RoleEnv {
  email: string;
  password: string;
}

export function adminCredentials(): RoleEnv {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set. ' +
      'See playwright.config.ts for the expected env vars.'
    );
  }
  return { email, password };
}

export function techCredentials(): RoleEnv | null {
  const email = process.env.E2E_TECH_EMAIL;
  const password = process.env.E2E_TECH_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}
