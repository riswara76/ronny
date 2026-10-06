#!/usr/bin/env node
// Creates the DCU Active test accounts: 1 admin + 2 normal users.
//
// Usage (never commit the values):
//   SUPABASE_URL=https://<project>.supabase.co \
//   SUPABASE_SECRET_KEY=<secret / service-role key> \
//   DCU_ADMIN_EMAIL=admin@example.com DCU_USER1_EMAIL=user1@example.com DCU_USER2_EMAIL=user2@example.com \
//   [DCU_TEST_PASSWORD=<password>] \
//   node scripts/create-test-users.mjs
//
// * The secret key is used only from this machine; it must never be placed in the app.
// * If DCU_TEST_PASSWORD is not set, a strong random password is generated per account
//   and printed ONCE to the terminal. Store it in your password manager.
// * Accounts are created already email-verified (they are operator-created test accounts).
// * Idempotent: an existing account is left as is (role is still enforced).
import { randomBytes } from 'node:crypto';

const env = (name, required = true) => {
  const v = process.env[name];
  if (required && !v) { console.error(`Missing env ${name}`); process.exit(1); }
  return v;
};

const base = env('SUPABASE_URL').replace(/\/$/, '');
const secret = env('SUPABASE_SECRET_KEY');
const sharedPassword = env('DCU_TEST_PASSWORD', false);
const accounts = [
  { email: env('DCU_ADMIN_EMAIL'), name: 'DCU Test Admin', role: 'ADMIN' },
  { email: env('DCU_USER1_EMAIL'), name: 'DCU Test User One', role: 'USER' },
  { email: env('DCU_USER2_EMAIL'), name: 'DCU Test User Two', role: 'USER' },
];
const headers = { apikey: secret, authorization: `Bearer ${secret}`, 'content-type': 'application/json' };

async function findUser(email) {
  for (let page = 1; page < 50; page++) {
    const r = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=100`, { headers });
    const body = await r.json();
    const hit = (body.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit || (body.users ?? []).length < 100) return hit;
  }
  return undefined;
}

for (const a of accounts) {
  let user = await findUser(a.email);
  let password = null;
  if (!user) {
    password = sharedPassword ?? `${randomBytes(12).toString('base64url')}!9a`;
    const r = await fetch(`${base}/auth/v1/admin/users`, {
      method: 'POST', headers,
      body: JSON.stringify({ email: a.email, password, email_confirm: true, user_metadata: { full_name: a.name } }),
    });
    if (!r.ok) { console.error(`create ${a.email}: ${r.status} ${await r.text()}`); process.exit(1); }
    user = await r.json();
  }
  const p = await fetch(`${base}/rest/v1/profiles?id=eq.${user.id}`, {
    method: 'PATCH', headers: { ...headers, prefer: 'return=minimal' }, body: JSON.stringify({ role: a.role }),
  });
  if (!p.ok) { console.error(`set role ${a.email}: ${p.status} ${await p.text()}`); process.exit(1); }
  console.log(`${a.role.padEnd(5)} ${a.email}${password && !sharedPassword ? `  password: ${password}` : password ? '  (password from DCU_TEST_PASSWORD)' : '  (already existed)'}`);
}
