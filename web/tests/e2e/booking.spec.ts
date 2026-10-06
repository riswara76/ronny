import { test, expect, type Page } from '@playwright/test';
import {
  CHECKIN_NOW_START, bookAs, createUser, dayButton, insertBookingFixture, jakartaDate, login, q, restAs, type TestUser,
} from './support';

/** Opens the booking page for a facility on a given date (as a user would after tapping the card). */
async function openFacility(page: Page, code: string, date: string, activity?: string) {
  await page.getByRole('link', { name: 'Book', exact: true }).click();
  await page.getByTestId(`facility-${code}`).click();
  if (activity) await page.getByRole('button', { name: activity, exact: true }).click();
  await page.getByRole('button', { name: dayButton(date) }).click();
}

async function bookViaUi(page: Page, time: string, duration?: string) {
  await page.getByTestId(`slot-${time}`).click();
  if (duration) await page.getByRole('button', { name: new RegExp(`^${duration}`) }).click();
  await page.getByRole('button', { name: 'Review booking' }).click();
  await expect(page.getByRole('dialog', { name: 'Review your booking' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm booking' }).click();
}

test.describe('Booking journeys (Android-size viewport)', () => {
  let d1: string, d2: string, d3: string, d4: string, d5: string, d6: string;
  test.beforeAll(async () => {
    [d1, d2, d3, d4, d5, d6] = await Promise.all([1, 2, 3, 4, 5, 6].map(jakartaDate));
  });

  test('home lists the 6 facilities; availability comes from the backend', async ({ page }) => {
    const u = await createUser('home');
    await login(page, u);
    for (const code of ['TENNIS', 'BASKETBALL_FUTSAL', 'TABLE_TENNIS', 'FOOTBALL', 'AIR_HOCKEY', 'FOOSBALL']) {
      await expect(page.getByTestId(`facility-${code}`)).toBeVisible();
    }
    await expect(page.getByRole('link', { name: /Book a facility/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);   // normal users never see Admin
    await openFacility(page, 'TENNIS', d1);
    await expect(page.getByTestId('slot-06:00')).toContainText('Available');
    await expect(page.getByTestId('slot-20:30')).toBeVisible();
    await expect(page.getByTestId('slot-21:00')).toHaveCount(0);
    await expect(page.getByText('Times are shown in Jakarta time (WIB).')).toBeVisible();
  });

  test('Tennis 30 / 60 / 90 minutes, and only durations that fit are offered', async ({ page, browser }) => {
    const a = await createUser('tennisa');
    await login(page, a);
    await openFacility(page, 'TENNIS', d1);
    await bookViaUi(page, '18:00', '30 minutes');
    await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
    await expect(page.locator('.result-card')).toContainText('18:00–18:30');

    await page.getByRole('button', { name: 'Back to home' }).click();
    await openFacility(page, 'TENNIS', d2);
    await bookViaUi(page, '18:00', '60 minutes');
    await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
    await expect(page.locator('.result-card')).toContainText('18:00–19:00');
    await expect(page.locator('.result-card')).toContainText('60 minutes');

    const b = await createUser('tennisb');
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, timezoneId: 'America/New_York' });
    const pb = await ctx.newPage();
    await login(pb, b);
    await openFacility(pb, 'TENNIS', d3);
    await bookViaUi(pb, '18:00', '90 minutes');
    await expect(pb.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
    await expect(pb.locator('.result-card')).toContainText('18:00–19:30');
    await expect(pb.locator('.result-card')).toContainText('90 minutes');

    // Someone else at 17:00 on d3 can only have 30 or 60 minutes (18:00 is taken).
    const c = await createUser('tennisc');
    await pb.getByRole('link', { name: 'Profile', exact: true }).click();
    await pb.getByRole('button', { name: 'Sign out' }).click();
    await login(pb, c);
    await openFacility(pb, 'TENNIS', d3);
    await expect(pb.getByTestId('slot-18:00')).toContainText('Booked');
    await expect(pb.getByTestId('slot-18:00')).toBeDisabled();
    await pb.getByTestId('slot-17:00').click();
    await expect(pb.getByRole('button', { name: /^30 minutes/ })).toBeVisible();
    await expect(pb.getByRole('button', { name: /^60 minutes/ })).toBeVisible();
    await expect(pb.getByRole('button', { name: /^90 minutes/ })).toHaveCount(0);
    await ctx.close();
  });

  test('Basketball booking makes the shared court unavailable for Futsal', async ({ page, browser }) => {
    const a = await createUser('baller');
    await login(page, a);
    await page.getByRole('link', { name: 'Book', exact: true }).click();
    await page.getByTestId('facility-BASKETBALL_FUTSAL').click();
    await expect(page.getByRole('group', { name: 'What would you like to play?' })).toBeVisible();
    await page.getByRole('button', { name: 'Basketball', exact: true }).click();
    await page.getByRole('button', { name: dayButton(d1) }).click();
    await bookViaUi(page, '10:00', '60 minutes');
    await expect(page.locator('.result-card')).toContainText('Basketball · Basketball / Futsal');

    const b = await createUser('futsal');
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const pb = await ctx.newPage();
    await login(pb, b);
    await openFacility(pb, 'BASKETBALL_FUTSAL', d1, 'Futsal');
    await expect(pb.getByTestId('slot-10:00')).toContainText('Booked');
    await expect(pb.getByTestId('slot-10:30')).toBeDisabled();
    await expect(pb.getByTestId('slot-11:00')).toBeEnabled();
    await ctx.close();
  });

  for (const [code, name] of [['AIR_HOCKEY', 'Air Hockey'], ['FOOSBALL', 'Foosball']] as const) {
    test(`${name}: tables are allocated automatically (2 spots, then full)`, async ({ page }) => {
      const users = await Promise.all([1, 2, 3].map((i) => createUser(`${code.toLowerCase().replace('_', '')}${i}`)));
      await login(page, users[0]!);
      await openFacility(page, code, d2);
      await expect(page.getByTestId('slot-12:00')).toContainText('2 spots left');
      await bookViaUi(page, '12:00');
      await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
      await expect(page.getByText(/Table [12]/)).toHaveCount(0);   // the user never chooses or sees a table number

      await page.getByRole('link', { name: 'Profile', exact: true }).click();
      await page.getByRole('button', { name: 'Sign out' }).click();
      await login(page, users[1]!);
      await openFacility(page, code, d2);
      await expect(page.getByTestId('slot-12:00')).toContainText('1 spot left');
      await bookViaUi(page, '12:00');
      await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

      await page.getByRole('link', { name: 'Profile', exact: true }).click();
      await page.getByRole('button', { name: 'Sign out' }).click();
      await login(page, users[2]!);
      await openFacility(page, code, d2);
      await expect(page.getByTestId('slot-12:00')).toContainText('Full');
      await expect(page.getByTestId('slot-12:00')).toBeDisabled();

      const tables = await q<{ name: string }>(`select distinct r.name from public.bookings b join public.resources r on r.id = b.resource_id
        where b.user_id = any($1) and b.status = 'CONFIRMED'`, [users.map((u) => u.id)]);
      expect(tables.map((t) => t.name).sort()).toEqual([`${name} Table 1`, `${name} Table 2`]);
    });
  }

  test('fair-use rules are explained: max upcoming bookings and once per facility per day', async ({ page }) => {
    const u = await createUser('rules');
    await login(page, u);
    await openFacility(page, 'TABLE_TENNIS', d4);
    await bookViaUi(page, '10:00');
    await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

    await page.getByRole('button', { name: 'Back to home' }).click();
    await openFacility(page, 'TABLE_TENNIS', d4);
    await bookViaUi(page, '15:00');
    const dialog = page.getByRole('dialog', { name: 'Review your booking' });
    await expect(dialog.getByRole('alert')).toContainText('You already have a booking for this facility on that day.');
    await dialog.getByRole('button', { name: 'Change' }).click();

    await openFacility(page, 'FOOTBALL', d4);
    await bookViaUi(page, '07:00');
    await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

    await page.getByRole('button', { name: 'Back to home' }).click();
    await openFacility(page, 'FOOSBALL', d5);
    await bookViaUi(page, '07:00');
    await expect(page.getByRole('dialog', { name: 'Review your booking' }).getByRole('alert'))
      .toContainText('You already have the maximum number of upcoming bookings.');
  });

  test('cancel a booking: confirmation, history and the slot is released', async ({ page }) => {
    const u = await createUser('canceller');
    await login(page, u);
    await openFacility(page, 'FOOTBALL', d5);
    await bookViaUi(page, '09:00');
    await page.getByRole('button', { name: 'View my booking' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel this booking?' });
    await expect(dialog).toContainText('The time will become available to other users.');
    await dialog.getByRole('button', { name: 'Yes, cancel booking' }).click();
    await expect(page.getByText('Booking cancelled.')).toBeVisible();
    await expect(page.locator('.detail-card .badge')).toHaveText('Cancelled');

    await page.getByRole('link', { name: 'My Bookings', exact: true }).click();
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByTestId('booking-card').first()).toContainText('Cancelled');

    await openFacility(page, 'FOOTBALL', d5);
    await expect(page.getByTestId('slot-09:00')).toContainText('Available');
  });

  test('check-in: enabled inside the window, disabled before it, no-show shown in history', async ({ page }) => {
    const u = await createUser('checker');
    await insertBookingFixture(u, 'TABLE_TENNIS', CHECKIN_NOW_START);                      // check-in window is open now
    await insertBookingFixture(u, 'FOOTBALL', `date_trunc('hour', now()) - interval '2 hours'`); // missed, 2h ago
    await login(page, u);

    const next = page.getByTestId('next-booking');
    await expect(next).toContainText('Table Tennis');
    await expect(next.getByRole('button', { name: 'Check in' })).toBeEnabled();
    await next.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByText("You're checked in")).toBeVisible();
    await expect(next).toContainText('Checked in');
    await expect(next.getByRole('button', { name: 'Check in' })).toHaveCount(0);

    // A future booking: Check in is visible but disabled, with the opening time.
    const r = await bookAs(u, 'TENNIS', 'TENNIS', d6, '18:00', 30);
    expect(r.status).toBe(200);
    await page.getByRole('link', { name: 'My Bookings', exact: true }).click();
    const future = page.getByTestId('booking-card').filter({ hasText: '18:00–18:30' });
    await expect(future.getByRole('button', { name: 'Check in' })).toBeDisabled();
    await expect(future).toContainText('Check-in opens at 17:45');

    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByTestId('booking-card').filter({ hasText: 'Football' })).toContainText('No-show');
  });

  test('concurrency: slot taken between review and confirm shows the friendly message and refreshes', async ({ page }) => {
    const u = await createUser('slowpoke');
    const rival = await createUser('rival');
    await login(page, u);
    await openFacility(page, 'TENNIS', d4);
    await page.getByTestId('slot-19:00').click();
    await page.getByRole('button', { name: /^30 minutes/ }).click();
    await page.getByRole('button', { name: 'Review booking' }).click();
    await expect(page.getByRole('dialog', { name: 'Review your booking' })).toBeVisible();

    expect((await bookAs(rival, 'TENNIS', 'TENNIS', d4, '19:00', 30)).status).toBe(200);   // someone else is faster
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByRole('alert')).toContainText('Sorry, this time slot was just booked by another user. Please choose another available time.');
    await expect(page.getByTestId('slot-19:00')).toContainText('Booked');
    await expect(page.getByText(/constraint|P0001|SQL/)).toHaveCount(0);
  });

  test('realtime: availability updates on screen when someone else books', async ({ page }) => {
    const viewer = await createUser('viewer');
    const other = await createUser('other');
    await login(page, viewer);
    await openFacility(page, 'FOOTBALL', d6);
    await expect(page.getByTestId('slot-07:00')).toContainText('Available');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.realtime), { timeout: 15_000 }).toBe('SUBSCRIBED');
    expect((await bookAs(other, 'FOOTBALL', 'FOOTBALL', d6, '07:00')).status).toBe(200);
    // Well under the 60 s fallback refetch: this can only be the Realtime ping.
    await expect(page.getByTestId('slot-07:00')).toContainText('Booked', { timeout: 8_000 });
  });

  test('offline: no stale availability and no booking actions', async ({ page, context }) => {
    const u = await createUser('offline');
    await login(page, u);
    await openFacility(page, 'TENNIS', d5);
    await page.getByTestId('slot-08:00').click();
    await context.setOffline(true);
    await expect(page.getByText('You are offline. Connect to the internet to view live availability or make a booking.')).toBeVisible();
    await expect(page.getByText("Live availability is hidden while you're offline.")).toBeVisible();
    await expect(page.getByTestId('slot-08:00')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Review booking' })).toBeDisabled();
    await context.setOffline(false);
    await expect(page.getByTestId('slot-08:00')).toBeVisible();
  });

  test('privacy: another user\'s identity never appears and their rows are not readable', async ({ page }) => {
    const owner = await createUser('secretive', { name: 'Siti Rahasia' });
    const viewer = await createUser('nosy');
    expect((await bookAs(owner, 'TENNIS', 'TENNIS', d6, '07:00', 60)).status).toBe(200);
    await login(page, viewer);
    await openFacility(page, 'TENNIS', d6);
    await expect(page.getByTestId('slot-07:00')).toContainText('Booked');
    const html = await page.content();
    expect(html).not.toContain('Siti');
    expect(html).not.toContain(owner.email);
    expect((await restAs(viewer, 'bookings?select=*')).body).toEqual([]);
    expect((await restAs(viewer, `profiles?select=*&id=eq.${owner.id}`)).body).toEqual([]);
  });
});

export type { TestUser };
