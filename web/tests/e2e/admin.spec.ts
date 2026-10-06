import { test, expect } from '@playwright/test';
import { bookAs, createUser, dayButton, jakartaDate, login, q, rpcAs } from './support';

test.describe('Admin journeys (desktop Chrome 1440×900)', () => {
  test('non-admins cannot reach admin screens; admins see the Admin entry', async ({ page }) => {
    const u = await createUser('plain');
    await login(page, u);
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
    await page.goto('/admin/bookings');
    await expect(page).toHaveURL(/\/$/);   // redirected home (cosmetic); the RPCs refuse anyway
    expect((await rpcAs(u, 'admin_list_bookings')).body.message).toBe('NOT_AUTHORIZED');
  });

  test('dashboard shows operational metrics and utilization', async ({ page }) => {
    const admin = await createUser('boss', { admin: true });
    const u = await createUser('player');
    const today = await jakartaDate(0);
    const tomorrow = await jakartaDate(1);
    await bookAs(u, 'AIR_HOCKEY', 'AIR_HOCKEY', tomorrow, '15:00');
    await login(page, admin);
    await page.getByRole('link', { name: 'Admin' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // Regression (Phase 4): the admin's own profile must load even though RLS lets admins see all profiles.
    await page.getByRole('link', { name: 'Back to booking app' }).click();
    await page.getByRole('link', { name: 'Profile', exact: true }).click();
    await expect(page.getByText(admin.email)).toBeVisible();
    await page.goto('/admin');
    for (const label of ['Bookings on this day', 'Upcoming bookings (all days)', 'Checked in', 'Cancellations', 'No-shows (last 7 days)', 'Active users']) {
      await expect(page.getByRole('list', { name: 'Summary' }).getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Facility utilization' })).toBeVisible();
    await page.getByLabel('Date').fill(tomorrow);
    await expect(page.getByRole('img', { name: /Air Hockey .*% utilized/ })).toBeVisible();
    await expect(page.locator('.mini-list')).toContainText('Player Tester');
    expect(today).not.toBe(tomorrow);
  });

  test('booking management: search, view identity, cancel with reason', async ({ page }) => {
    const admin = await createUser('ops', { admin: true });
    const u = await createUser('bambang', { name: 'Bambang Searchable' });
    const day = await jakartaDate(2);
    const r = await bookAs(u, 'TENNIS', 'TENNIS', day, '16:00', 60);
    expect(r.status).toBe(200);
    await login(page, admin);
    await page.goto('/admin/bookings');
    await page.getByRole('searchbox').fill('Searchable');
    const row = page.getByRole('row', { name: /Bambang Searchable/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText(u.email);
    await expect(row).toContainText('Tennis Court');
    await row.getByRole('button', { name: /View booking/ }).click();
    const dialog = page.getByRole('dialog', { name: new RegExp(r.body.booking_code) });
    await expect(dialog).toContainText('Bambang Searchable');
    await dialog.getByRole('button', { name: 'Cancel booking…' }).click();
    await dialog.getByLabel('Reason (shown to the user)').fill('Court lighting repair');
    await dialog.getByRole('button', { name: 'Cancel this booking' }).click();
    await expect(page.getByText(/Booking cancelled/)).toBeVisible();
    await expect(row).toContainText('Cancelled by admin');

    // The user sees it in their history with the reason.
    const hist = await rpcAs(u, 'get_my_bookings', { p_scope: 'HISTORY' });
    expect(hist.body[0].effective_status).toBe('ADMIN_CANCELLED');
    expect(hist.body[0].cancellation_reason).toBe('Court lighting repair');
  });

  test('facility block: conflicts shown first, explicit confirmation, users see Unavailable, block removable', async ({ page, browser }) => {
    const admin = await createUser('blocker', { admin: true });
    const u = await createUser('victim', { name: 'Victim Booker' });
    const day = await jakartaDate(3);
    expect((await bookAs(u, 'TENNIS', 'TENNIS', day, '10:00', 60)).status).toBe(200);

    await login(page, admin);
    await page.goto('/admin/blocks');
    await page.getByRole('button', { name: 'New block' }).click();
    const form = page.getByRole('dialog', { name: 'New facility block' });
    await form.getByLabel('Facility').selectOption({ label: 'Tennis' });
    await form.getByLabel('Start date').fill(day);
    await form.getByLabel('Start time').selectOption('09:00');
    await form.getByLabel('End date').fill(day);
    await form.getByLabel('End time').selectOption('12:00');
    await form.getByLabel('Reason').selectOption('MAINTENANCE');
    await form.getByLabel('Note (admins only)').fill('Resurfacing — internal note');
    await form.getByRole('button', { name: 'Create block' }).click();

    const confirm = page.getByRole('dialog', { name: 'This block affects existing bookings' });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByTestId('block-conflicts')).toContainText('Victim Booker');
    expect((await q('select count(*)::int as n from public.facility_blocks'))[0]!.n).toBe(0);   // nothing written yet
    await confirm.getByRole('button', { name: /Cancel 1 booking and create block/ }).click();
    await expect(page.getByText('Block created. 1 booking was cancelled.')).toBeVisible();
    await expect(page.getByRole('row', { name: /Tennis/ })).toContainText('Maintenance');

    const st = await q<{ status: string; cancellation_type: string }>(
      'select status, cancellation_type from public.bookings where user_id = $1', [u.id]);
    expect(st[0]).toEqual({ status: 'ADMIN_CANCELLED', cancellation_type: 'SYSTEM_BLOCK' });

    // A participant sees the block as Unavailable with the reason category, never the note.
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const pu = await ctx.newPage();
    const viewer = await createUser('looker');
    await login(pu, viewer);
    await pu.goto('/book/tennis');
    await pu.getByRole('button', { name: dayButton(day) }).click();
    await expect(pu.getByTestId('slot-10:00')).toContainText('Unavailable · Maintenance');
    await expect(pu.getByTestId('slot-10:00')).toBeDisabled();
    expect(await pu.content()).not.toContain('Resurfacing');

    // Remove the block -> bookable again.
    await page.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('dialog', { name: 'Remove this block?' }).getByRole('button', { name: 'Remove block' }).click();
    await expect(page.getByText('Block removed.')).toBeVisible();
    await pu.reload();
    await pu.getByRole('button', { name: dayButton(day) }).click();
    await expect(pu.getByTestId('slot-10:00')).toContainText('Available');
    await ctx.close();
  });

  test('user management: deactivate (enforced by the server) and reactivate', async ({ page }) => {
    const admin = await createUser('people', { admin: true });
    const u = await createUser('dimas', { name: 'Dimas Deactivate' });
    const day = await jakartaDate(4);
    expect((await bookAs(u, 'FOOTBALL', 'FOOTBALL', day, '10:00')).status).toBe(200);
    await login(page, admin);
    await page.goto('/admin/users');
    await page.getByRole('searchbox').fill('Dimas');
    const row = page.getByTestId(`user-row-${u.email}`);
    await expect(row).toContainText('Active');
    await row.getByRole('button', { name: 'Deactivate' }).click();
    const dialog = page.getByRole('dialog', { name: 'Deactivate this user?' });
    await dialog.getByLabel('Reason (for the audit log)').fill('Programme finished');
    await dialog.getByRole('button', { name: 'Deactivate user' }).click();
    await expect(page.getByText(/was deactivated and 1 future booking/)).toBeVisible();
    await expect(row).toContainText('Deactivated');
    expect((await rpcAs(u, 'get_my_bookings')).body.message).toBe('ACCOUNT_DISABLED');

    await row.getByRole('button', { name: 'Reactivate' }).click();
    await page.getByRole('dialog', { name: 'Reactivate this user?' }).getByRole('button', { name: 'Reactivate user' }).click();
    await expect(row).toContainText('Active');
    expect((await rpcAs(u, 'get_my_bookings')).status).toBe(200);
    // Admin cannot lock themselves out from the UI.
    await page.getByRole('searchbox').fill(admin.email);
    await expect(page.getByTestId(`user-row-${admin.email}`).getByRole('button', { name: 'Deactivate' })).toBeDisabled();
  });
});
