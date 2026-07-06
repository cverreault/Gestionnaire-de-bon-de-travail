import { defineConfig, devices } from '@playwright/test';

/**
 * TaskMgr E2E smoke tests (B18).
 *
 * These run against a LIVE running stack (docker compose already up).
 * Set BASE_URL in env when the stack lives somewhere other than
 * http://localhost:8088.
 *
 * Usage :
 *   cd e2e
 *   npx playwright install chromium
 *   BASE_URL=http://172.16.45.125:8088 npx playwright test
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8088',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
