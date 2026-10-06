import { test, expect, type Page } from '@playwright/test';
import { createUser, jakartaDate, login, SUPABASE_URL } from './support';

const isRemote = !!process.env.E2E_BASE_URL;

/** Records CSP violations and console errors from the first script onwards. */
async function watch(page: Page) {
  const problems: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`);
    });
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content Security Policy|Refused to/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return async () => {
    const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => []);
    return [...problems, ...csp.map((c) => `csp: ${c}`)];
  };
}

test.describe('Security headers and CSP', () => {
  test('response headers on documents and assets', async ({ request }) => {
    const doc = await request.get('/book');            // SPA route served via fallback
    const h = doc.headers();
    const csp = h['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain(new URL(SUPABASE_URL).origin);   // connect-src matches the backend in use
    expect(csp).not.toContain('__SUPABASE');
    expect(h['strict-transport-security']).toMatch(/max-age=\d{7,}/);
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toContain('geolocation=()');
    expect(h['cache-control'] ?? '').toMatch(/no-cache|max-age=0/);

    const sw = await request.get('/sw.js');
    expect(sw.status()).toBe(200);
    expect(sw.headers()['cache-control'] ?? '').toMatch(/no-cache|max-age=0/);

    const html = await doc.text();
    const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    expect(asset).toBeTruthy();
    const a = await request.get(asset!);
    expect(a.headers()['cache-control']).toContain('immutable');
    if (isRemote) expect(doc.url()).toMatch(/^https:/);
  });

  test('no CSP violations or console errors on user and admin screens', async ({ page }) => {
    const admin = await createUser('cspadmin', { admin: true });
    const collect = await watch(page);
    const day = await jakartaDate(5);
    await page.goto('/login');
    await page.goto('/register');
    await login(page, admin);
    for (const path of ['/', '/book', `/book/tennis?date=${day}`, `/book/basketball_futsal`, '/bookings', '/bookings?tab=history',
      '/profile', '/admin', '/admin/bookings', '/admin/blocks', '/admin/users']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    // Realtime (WebSocket) must be allowed by connect-src.
    await page.goto(`/book/tennis?date=${day}`);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.realtime), { timeout: 15_000 }).toBe('SUBSCRIBED');
    expect(await collect()).toEqual([]);
  });
});
