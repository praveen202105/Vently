import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Vently E2E tests.
 *
 * Assumes web is on :3000 and api on :4000 — start them via `pnpm dev` from
 * the repo root before running, or rely on the `webServer` blocks below if
 * you want Playwright to manage them.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // tests share matchmaking state — keep sequential
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Auto-grant microphone so voice-call tests can verify getUserMedia
        // wires up without a permission prompt.
        permissions: ['microphone'],
      },
    },
  ],
});
