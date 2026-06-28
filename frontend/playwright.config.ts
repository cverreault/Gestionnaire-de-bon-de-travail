import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for TaskMgr E2E tests (C5).
 *
 * Target: the same docker compose stack the developer runs locally.
 * Default ports — backend on 3800 (mapped from container 3000), frontend
 * served behind nginx on 8088.
 *
 * Required env vars at test time (loaded from .env.e2e or shell):
 *   E2E_BASE_URL                — defaults to http://localhost:8088
 *   E2E_ADMIN_EMAIL              — admin user that already exists in the DB
 *   E2E_ADMIN_PASSWORD           — its password
 *
 * Optional:
 *   E2E_TECH_EMAIL / _PASSWORD   — required for the full create→assign→
 *                                  technician-completes scenario
 *
 * The tests are NOT meant to seed the DB themselves — they assume the
 * docker stack is already running with users provisioned. Use the
 * default seed (npm run seed) if you need a fresh fixture set.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8088';

export default defineConfig({
  testDir: './e2e',
  // Each test gets a 60s budget — covers the slowest path (login + a
  // multi-step BT transition flow), well under CI defaults.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,        // shared DB; keep ordering deterministic
  retries: process.env.CI ? 1 : 0,
  workers: 1,                  // serialize against the shared backend
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
