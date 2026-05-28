import { defineConfig, devices } from '@playwright/test';

/**
 * Agent-mode Playwright config. Drives the LIVE PRODUCTION URLs by default
 * so you can verify the deployed app from your laptop with one command:
 *
 *   pnpm test:agent
 *
 * Differences from the regular E2E config:
 *  - baseURL defaults to the production Vercel URL.
 *  - Always takes screenshots at every step (not just on failure).
 *  - Always records traces (great for debugging from the HTML report).
 *  - Opens the HTML report at the end so you can browse screenshots.
 *  - Longer per-assertion timeouts to tolerate cross-continent latency.
 */
export default defineConfig({
  testDir: './tests/agent',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'agent-report', open: 'on-failure' }]],
  outputDir: 'agent-results',
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'https://vently-web-gamma.vercel.app',
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
      },
    },
  ],
});
