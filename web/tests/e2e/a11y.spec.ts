import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createUser, jakartaDate, PASSWORD } from './support';

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

async function tabTo(page: Page, predicate: string, max = 40) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(predicate)) return;
  }
  throw new Error(`could not reach element by keyboard: ${predicate}`);
}

test.describe('Accessibility baseline', () => {
  test('no serious/critical axe violations on key screens (desktop and phone width)', async ({ page }) => {
    const admin = await createUser('axeadmin', { admin: true });
    const pages: [string, string][] = [];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/login');
      pages.push([`${width} login`, (await axe(page)).join('\n')]);
      await page.goto('/register');
      pages.push([`${width} register`, (await axe(page)).join('\n')]);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Good');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/book', `/book/tennis?date=${await jakartaDate(1)}`, '/bookings', '/profile', '/admin', '/admin/bookings', '/admin/blocks', '/admin/users']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);
        pages.push([`${width} ${path}`, (await axe(page)).join('\n')]);
      }
    }
    const failures = pages.filter(([, v]) => v);
    expect(failures, failures.map(([p, v]) => `${p}\n${v}`).join('\n\n')).toEqual([]);
  });

  test('keyboard only: log in, choose a time, review and confirm a booking', async ({ page }) => {
    const u = await createUser('keyboard');
    const day = await jakartaDate(3);
    await page.goto('/login');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await tabTo(page, `document.activeElement?.getAttribute('type') === 'email'`);
    await page.keyboard.type(u.email);
    await page.keyboard.press('Tab');
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Good');

    await page.goto(`/book/table_tennis?date=${day}`);
    await expect(page.getByTestId('slot-06:00')).toBeVisible();
    await tabTo(page, `document.activeElement?.dataset.testid === 'slot-06:00'`, 80);
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).boxShadow);
    expect(ring, 'visible focus indicator').not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('slot-06:00')).toHaveAttribute('aria-pressed', 'true');
    await tabTo(page, `document.activeElement?.textContent?.trim() === 'Review booking'`, 80);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Review your booking' });
    await expect(dialog).toBeVisible();
    await tabTo(page, `document.activeElement?.textContent?.trim() === 'Confirm booking'`, 10);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeFocused();
  });

  test('dialogs close with Escape and return to the page', async ({ page }) => {
    const u = await createUser('escape');
    const day = await jakartaDate(4);
    await page.goto('/login');
    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Good');
    await page.goto(`/book/football?date=${day}`);
    await page.getByTestId('slot-08:00').click();
    await page.getByRole('button', { name: 'Review booking' }).click();
    await expect(page.getByRole('dialog', { name: 'Review your booking' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('slot-08:00')).toHaveAttribute('aria-pressed', 'true');
  });
});
