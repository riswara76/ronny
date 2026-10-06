import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { bookAs, createUser, jakartaDate, login, noHorizontalOverflow, type TestUser } from './support';

const SHOTS = '../docs/phase-3/screenshots';
mkdirSync(SHOTS, { recursive: true });

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const VIEWPORTS = [
  { name: 'iphone', width: 390, height: 844, mobile: true, ua: IOS_UA, dpr: 3 },
  { name: 'android', width: 412, height: 915, mobile: true, ua: ANDROID_UA, dpr: 2.625 },
  { name: 'tablet', width: 820, height: 1180, mobile: true, ua: undefined, dpr: 2 },
  { name: 'desktop', width: 1440, height: 900, mobile: false, ua: undefined, dpr: 1 },
] as const;

let user: TestUser;
let admin: TestUser;
let day1: string;

test.beforeAll(async () => {
  user = await createUser('ayu', { name: 'Ayu Pratama' });
  admin = await createUser('chief', { admin: true, name: 'Chief Admin' });
  // Day +7 is not used by the other specs, so this spec is independent of run order.
  day1 = await jakartaDate(7);
  const others = await Promise.all([1, 2, 3, 4].map((i) => createUser(`busy${i}`)));
  await bookAs(user, 'TENNIS', 'TENNIS', day1, '18:00', 60);
  await bookAs(user, 'AIR_HOCKEY', 'AIR_HOCKEY', day1, '20:00');
  // Some realistic occupancy so the grids show every state.
  await bookAs(others[0]!, 'TENNIS', 'TENNIS', day1, '07:00', 90);
  await bookAs(others[1]!, 'TENNIS', 'TENNIS', day1, '10:00', 30);
  await bookAs(others[2]!, 'BASKETBALL_FUTSAL', 'FUTSAL', day1, '16:00', 60);
  await bookAs(others[3]!, 'AIR_HOCKEY', 'AIR_HOCKEY', day1, '12:00');
  await bookAs(admin, 'TENNIS', 'TENNIS', day1, '19:30', 30);
});

async function open(browser: Browser, v: (typeof VIEWPORTS)[number]) {
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height }, isMobile: v.mobile, hasTouch: v.mobile, deviceScaleFactor: v.dpr,
    userAgent: v.ua, timezoneId: 'America/New_York', locale: 'en-GB',
  });
  return { ctx, page: await ctx.newPage() };
}

async function minTouchTarget(page: Page, selector: string) {
  return page.$$eval(selector, (els) => Math.min(...els.filter((e) => (e as HTMLElement).offsetParent !== null)
    .map((e) => e.getBoundingClientRect().height)));
}

for (const v of VIEWPORTS) {
  test(`user screens at ${v.name} ${v.width}×${v.height}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, v);
    await login(page, user);
    await expect(page.getByTestId('next-booking')).toContainText('Tennis');
    await noHorizontalOverflow(page);

    const nav = page.getByRole('navigation', { name: 'Main' });
    const box = (await nav.boundingBox())!;
    if (v.width < 768) {
      expect(box.y + box.height, 'bottom tab bar on phones').toBeGreaterThan(v.height - 100);
      expect(await minTouchTarget(page, '.user-nav a')).toBeGreaterThanOrEqual(44);
    } else {
      expect(box.x, 'side navigation on tablet/desktop').toBeLessThan(260);
      expect(box.height).toBeGreaterThan(200);
    }
    await page.screenshot({ path: `${SHOTS}/${v.name}-home.png`, fullPage: !v.mobile });

    await page.goto(`/book/tennis?date=${day1}`);
    await expect(page.getByTestId('slot-18:00')).toContainText('Your booking');
    await page.getByTestId('slot-15:00').click();
    await page.getByRole('button', { name: /^60 minutes/ }).click();
    await noHorizontalOverflow(page);
    if (v.mobile) expect(await minTouchTarget(page, '.slot, .date-chip, .choice')).toBeGreaterThanOrEqual(44);
    // Phones/tablets: capture what the user actually sees (fixed bars distort full-page captures).
    if (v.mobile) {
      await page.screenshot({ path: `${SHOTS}/${v.name}-booking-slots.png` });
      await page.getByRole('group', { name: 'Duration' }).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 160));
    }
    await page.screenshot({ path: `${SHOTS}/${v.name}-booking.png`, fullPage: !v.mobile });
    await page.getByRole('button', { name: 'Review booking' }).click();
    await expect(page.getByRole('dialog', { name: 'Review your booking' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/${v.name}-booking-review.png` });
    await page.keyboard.press('Escape');

    await page.goto('/book/basketball_futsal');
    await expect(page.getByRole('group', { name: 'What would you like to play?' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/${v.name}-activity.png` });

    await page.getByRole('link', { name: 'My Bookings', exact: true }).click();
    await expect(page.getByTestId('booking-card')).toHaveCount(2);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/${v.name}-my-bookings.png`, fullPage: !v.mobile });
    await ctx.close();
  });
}

for (const v of [VIEWPORTS[3], VIEWPORTS[2], VIEWPORTS[1]]) {
  test(`admin screens at ${v.name} ${v.width}×${v.height}`, async ({ browser }) => {
    const { ctx, page } = await open(browser, v);
    await login(page, admin);
    await page.goto('/admin');
    await page.getByLabel('Date').fill(day1);
    await expect(page.getByRole('img', { name: /^Tennis .*% utilized/ })).toBeVisible();
    await noHorizontalOverflow(page);
    const side = (await page.locator('.admin-side').boundingBox())!;
    if (v.width >= 1024) expect(side.height, 'sidebar on desktop').toBeGreaterThan(600);
    await page.screenshot({ path: `${SHOTS}/${v.name}-admin-dashboard.png`, fullPage: v.width >= 1024 });

    await page.goto(`/admin/bookings?from=${day1}`);
    await expect(page.getByText('Ayu Pratama').filter({ visible: true }).first()).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/${v.name}-admin-bookings.png`, fullPage: v.width >= 1024 });

    await page.goto('/admin/blocks');
    await page.getByRole('button', { name: 'New block' }).click();
    await expect(page.getByRole('dialog', { name: 'New facility block' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/${v.name}-admin-new-block.png` });
    await page.keyboard.press('Escape');

    await page.goto('/admin/users');
    await expect(page.getByText('Ayu Pratama')).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/${v.name}-admin-users.png`, fullPage: v.width >= 1024 });
    await ctx.close();
  });
}

test('auth screens on iPhone size', async ({ browser }) => {
  const { ctx, page } = await open(browser, VIEWPORTS[0]);
  await page.goto('/login');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: `${SHOTS}/iphone-login.png` });
  await page.goto('/register');
  await page.getByLabel('Password', { exact: true }).fill('abc1');
  await page.screenshot({ path: `${SHOTS}/iphone-register.png`, fullPage: true });
  await ctx.close();
});
