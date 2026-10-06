import { test, expect } from '@playwright/test';
import { createUser, inboxAddress, latestEmail, login, PASSWORD, q, rpcAs } from './support';


test.describe('Authentication journeys', () => {
  test('register → verification email → confirm via link → signed in (any email domain)', async ({ page }) => {
    const email = inboxAddress('new', 'gmail.com');         // any domain may register (D1)
    const t0 = Date.now() - 2000;
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Rina Participant');
    await page.getByLabel('Email').fill(email);

    // Weak password: rules are shown and the form refuses to submit.
    await page.getByLabel('Password', { exact: true }).fill('password');
    await page.getByLabel('Confirm password').fill('password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Password does not meet all the requirements.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Password requirements' })).toContainText('An uppercase letter');

    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page).toHaveURL(/\/verify\?email=/);

    // Not verified yet: login is refused with a clear message.
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toContainText('Please verify your email address first');

    const mail = await latestEmail(email, t0);
    expect(mail.subject).toMatch(/verification code/i);
    expect(mail.link).toContain('/auth/confirm?token_hash=');
    expect(mail.code).toMatch(/^\d{6}$/);

    // Opening the link does NOT verify by itself (scanner-safe); the button does.
    await page.goto(mail.link!.replace(/^https?:\/\/[^/]+/, ''));
    await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
    const before = await q<{ c: string | null }>('select email_confirmed_at as c from auth.users where email = $1', [email]);
    expect(before[0]!.c).toBeNull();
    await page.getByRole('button', { name: 'Confirm my email' }).click();
    await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue to DCU Active' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rina');

    // Re-using the link: invalid/expired state with "already verified? log in" + resend.
    await page.getByRole('link', { name: 'Profile', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.goto(mail.link!.replace(/^https?:\/\/[^/]+/, ''));
    await page.getByRole('button', { name: 'Confirm my email' }).click();
    await expect(page.getByRole('heading', { name: 'This link is invalid or has expired' })).toBeVisible();
    await expect(page.getByText('If you already verified your email')).toBeVisible();
    await expect(page.getByRole('button', { name: /new verification email/ })).toBeVisible();
  });

  test('register → verify with the 6-digit code', async ({ page }) => {
    const email = inboxAddress('code', 'yahoo.com');
    const t0 = Date.now() - 2000;
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Budi Trainer');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    const mail = await latestEmail(email, t0);

    await page.getByLabel('Verification code').fill('000000');
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page.getByRole('alert')).toContainText('invalid or has expired');

    await page.getByLabel('Verification code').fill(mail.code!);
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page.getByText('Your email is verified')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Budi');
  });

  test('login errors and forgot/reset password via the emailed link', async ({ page }) => {
    const u = await createUser('forgetful', { realInbox: true });
    await page.goto('/login');
    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Password', { exact: true }).fill('Wrong-Pass-1!');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password.');

    const t0 = Date.now() - 2000;
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email').fill(u.email);
    await page.getByRole('button', { name: 'Send reset email' }).click();
    await expect(page.getByText(/If an account exists/)).toBeVisible();

    const mail = await latestEmail(u.email, t0);
    expect(mail.link).toContain('/auth/reset-password?token_hash=');
    await page.goto(mail.link!.replace(/^https?:\/\/[^/]+/, ''));
    const newPassword = 'Brand-New-Pass9?';
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password').fill(newPassword);
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByText('Your password was updated. Please log in.')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Forgetful');
  });

  test('session persists across a browser restart and ends on sign-out', async ({ page, browser }) => {
    const u = await createUser('persist');
    await login(page, u);
    const state = await page.context().storageState();
    // A brand-new browser context with the saved storage = closing and reopening the browser / PWA.
    const ctx = await browser.newContext({ storageState: state, viewport: { width: 412, height: 915 } });
    const again = await ctx.newPage();
    await again.goto('/bookings');
    await expect(again.getByRole('heading', { name: 'My bookings' })).toBeVisible();
    await again.getByRole('link', { name: 'Profile', exact: true }).click();
    await again.getByRole('button', { name: 'Sign out' }).click();
    await expect(again.getByRole('heading', { name: 'Log in' })).toBeVisible();
    await again.goto('/bookings');
    await expect(again).toHaveURL(/\/login\?next=%2Fbookings/);
    await ctx.close();
  });

  test('deactivated user is moved to "Account disabled" on the next server call', async ({ page }) => {
    const admin = await createUser('admin', { admin: true });
    const u = await createUser('leaving');
    await login(page, u);
    const r = await rpcAs(admin, 'admin_set_user_active', { p_user_id: u.id, p_active: false, p_reason: 'test' });
    expect(r.status).toBe(200);
    // Same browser session and JWT: the next RPC is refused by the server.
    await page.getByRole('link', { name: 'My Bookings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Account disabled' })).toBeVisible();
    await expect(page).toHaveURL(/account-disabled/);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Back to log in' })).toBeVisible();
  });
});
