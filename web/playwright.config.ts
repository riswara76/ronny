import { defineConfig, devices } from '@playwright/test';

// Local: the production build served with its real _headers (scripts/serve-dist.mjs) + local Supabase.
// Staging: set E2E_BASE_URL=https://<staging host> and point the SUPABASE_* env at the hosted project.
const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,                      // tests share one database; keep runs deterministic
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: remote ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-GB',
    // The device is deliberately NOT in Jakarta: all times on screen must still be WIB.
    timezoneId: 'America/New_York',
  },
  webServer: remote ? undefined : {
    command: 'node scripts/serve-dist.mjs',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'android-chrome', use: { ...devices['Pixel 7'] }, testMatch: /(auth|booking)\.spec\.ts/ },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testMatch: /(admin|pwa|a11y|security)\.spec\.ts/ },
    { name: 'responsive', use: { ...devices['Desktop Chrome'] }, testMatch: /responsive\.spec\.ts/ },
  ],
});
