// Lighthouse on public and signed-in screens.
// Env: LH_BASE_URL (default http://localhost:4173), LH_EMAIL + LH_PASSWORD (an ADMIN test account),
//      LH_OUT (default ../docs/phase-4/lighthouse/local), PW_CHROMIUM (optional Chromium path).
// Participant screens use Lighthouse's mobile profile (throttled 4G, Moto G-class CPU);
// admin screens use the desktop profile.
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = (process.env.LH_BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const out = process.env.LH_OUT ?? '../docs/phase-4/lighthouse/local';
const port = 9333;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: [`--remote-debugging-port=${port}`],
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
});
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();

async function audit(name, path, { desktop = false } = {}) {
  const flags = {
    port, output: ['html', 'json'], logLevel: 'error', disableStorageReset: true,
    onlyCategories: ['performance', 'accessibility', 'best-practices'],
  };
  const result = await lighthouse(`${base}${path}`, flags, desktop ? desktopConfig : undefined);
  const [html, json] = result.report;
  writeFileSync(`${out}/${name}.html`, html);
  writeFileSync(`${out}/${name}.json`, json);
  const c = result.lhr.categories;
  const a = result.lhr.audits;
  return {
    page: name, path, profile: desktop ? 'desktop' : 'mobile',
    performance: Math.round(c.performance.score * 100),
    accessibility: Math.round(c.accessibility.score * 100),
    bestPractices: Math.round(c['best-practices'].score * 100),
    fcp: a['first-contentful-paint'].displayValue, lcp: a['largest-contentful-paint'].displayValue,
    tbt: a['total-blocking-time'].displayValue, cls: a['cumulative-layout-shift'].displayValue,
  };
}

const rows = [];
rows.push(await audit('login', '/login'));
rows.push(await audit('register', '/register'));

if (process.env.LH_EMAIL && process.env.LH_PASSWORD) {
  await page.goto(`${base}/login`);
  await page.getByLabel('Email').fill(process.env.LH_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.LH_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(`${base}/`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  rows.push(await audit('home', '/'));
  rows.push(await audit('book-tennis', '/book/tennis'));
  rows.push(await audit('my-bookings', '/bookings'));
  rows.push(await audit('admin-dashboard', '/admin', { desktop: true }));
  rows.push(await audit('admin-bookings', '/admin/bookings', { desktop: true }));
}
await browser.close();

writeFileSync(`${out}/summary.json`, JSON.stringify(rows, null, 2));
console.table(rows);
