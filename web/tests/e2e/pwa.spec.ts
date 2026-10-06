import { test, expect } from '@playwright/test';
import { createUser, jakartaDate, login, SUPABASE_URL } from './support';

test.describe('PWA', () => {
  test('manifest is valid for installation', async ({ page, request }) => {
    await page.goto('/login');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    const m = await (await request.get('/manifest.webmanifest')).json();
    expect(m.name).toBe('DCU Active');
    expect(m.short_name).toBe('DCU Active');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? `:${i.purpose}` : ''}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512:maskable']));
    for (const icon of m.icons) expect((await request.get(icon.src)).status()).toBe(200);
    expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);
  });

  test('service worker registers, Chrome reports the app installable, backend traffic is never cached', async ({ page, context }) => {
    const u = await createUser('pwa');
    await login(page, u);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    expect(installabilityErrors, JSON.stringify(installabilityErrors)).toEqual([]);

    await page.goto(`/book/tennis?date=${await jakartaDate(1)}`);
    await expect(page.getByTestId('slot-06:00')).toBeVisible();
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
      }
      return urls;
    });
    expect(cached.length).toBeGreaterThan(5);                                // app shell is precached
    expect(cached.filter((u) => u.startsWith(SUPABASE_URL) || /\/rest\/v1\/|\/auth\/v1\//.test(u))).toEqual([]);
  });

  test('offline reload: app shell opens, shows the offline message, no availability', async ({ page, context }) => {
    const u = await createUser('pwaoffline');
    await login(page, u);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.goto('/book/tennis');
    await expect(page.getByText('You are offline. Connect to the internet to view live availability or make a booking.')).toBeVisible();
    await expect(page.locator('.slot')).toHaveCount(0);
    await context.setOffline(false);
  });
});
