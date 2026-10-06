// Renders public/favicon.svg into the PNG icons the PWA manifest and iOS need.
// Uses the Playwright Chromium already required for E2E tests (no extra image tooling).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const targets = [
  { file: 'public/icons/icon-192.png', size: 192, pad: 0, bg: 'transparent' },
  { file: 'public/icons/icon-512.png', size: 512, pad: 0, bg: 'transparent' },
  // Maskable: content inside the 80% safe zone on a full-bleed background.
  { file: 'public/icons/icon-maskable-512.png', size: 512, pad: 0.12, bg: '#0b5cad' },
  { file: 'public/apple-touch-icon.png', size: 180, pad: 0.06, bg: '#0b5cad' },
];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0;background:${t.bg};display:grid;place-items:center;width:${t.size}px;height:${t.size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: t.file, omitBackground: t.bg === 'transparent' });
  console.log('wrote', t.file);
}
await browser.close();
