import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for OVERCOCKED e2e tests.
 *
 * The tests run against the Vite dev server (mock mode — no API keys needed),
 * which `webServer` spins up automatically. Mock lanes race deterministically,
 * so the e2e suite is stable without any provider access.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // the app holds global state (a running race); serial is safer
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:5199',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Autostart the Vite dev server on a fixed port (mock mode by default).
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
