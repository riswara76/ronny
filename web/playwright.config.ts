import { defineConfig, devices } from '@playwright/test';

// E2E tests run against the production build (vite preview) and the REAL local Supabase stack.
// Run through scripts/run-web-tests.sh, which exports the Supabase env and resets the database.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,                      // tests share one database; keep runs deterministic
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-GB',
    // The device is deliberately NOT in Jakarta: all times on screen must still be WIB.
    timezoneId: 'America/New_York',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'android-chrome', use: { ...devices['Pixel 7'] }, testMatch: /(auth|booking)\.spec\.ts/ },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testMatch: /(admin|pwa|a11y)\.spec\.ts/ },
    { name: 'responsive', use: { ...devices['Desktop Chrome'] }, testMatch: /responsive\.spec\.ts/ },
  ],
});
