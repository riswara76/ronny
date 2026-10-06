// Test-only helpers. Runs in Node (never bundled into the app). Uses the LOCAL Supabase
// secret key only to create test users and fixtures, exactly like an operator script would.
import { expect, type Page } from '@playwright/test';
import pg from 'pg';

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}: run scripts/run-web-tests.sh`);
  return v;
};
export const SUPABASE_URL = env('SUPABASE_URL');
const PUBLISHABLE = env('SUPABASE_PUBLISHABLE_KEY');
const SECRET = env('SUPABASE_SECRET_KEY');
const MAILPIT = env('MAILPIT_URL');
export const PASSWORD = 'Dcu-Test-2026!';      // local test value; meets the policy

export const pool = new pg.Pool({ connectionString: env('SUPABASE_DB_URL'), max: 4 });
export const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await pool.query(sql, params)).rows as T[];

let seq = 0;
const run = Date.now().toString(36);
export interface TestUser { email: string; id: string; name: string; token?: string }

export async function createUser(prefix: string, opts: { admin?: boolean; name?: string } = {}): Promise<TestUser> {
  const email = `${prefix}.${run}.${++seq}@example.com`;
  const name = opts.name ?? `${prefix[0]!.toUpperCase()}${prefix.slice(1)} Tester`;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`createUser ${email}: ${JSON.stringify(body)}`);
  if (opts.admin) await q(`update public.profiles set role = 'ADMIN' where id = $1`, [body.id]);
  return { email, id: body.id, name };
}

export async function tokenFor(u: TestUser): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: PUBLISHABLE, 'content-type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: PASSWORD }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`token ${u.email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

/** Call an RPC as a user over HTTP (used to create competing bookings during UI tests). */
export async function rpcAs(u: TestUser, fn: string, args: Record<string, unknown> = {}) {
  u.token ??= await tokenFor(u);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE, authorization: `Bearer ${u.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

export async function restAs(u: TestUser, path: string) {
  u.token ??= await tokenFor(u);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: PUBLISHABLE, authorization: `Bearer ${u.token}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}

export const facilityId = async (code: string) => (await q<{ id: string }>('select id from public.facilities where code = $1', [code]))[0]!.id;
export const activityId = async (code: string) => (await q<{ id: string }>('select id from public.activities where code = $1', [code]))[0]!.id;

export async function bookAs(u: TestUser, facility: string, activity: string, date: string, time: string, minutes = 30) {
  return rpcAs(u, 'create_booking', {
    p_facility_id: await facilityId(facility), p_activity_id: await activityId(activity),
    p_date: date, p_start_time: time, p_duration_minutes: minutes,
  });
}

/** Jakarta calendar date `offset` days from the server's today. */
export async function jakartaDate(offset: number): Promise<string> {
  return (await q<{ d: string }>(`select ((now() at time zone 'Asia/Jakarta')::date + $1::int)::text as d`, [offset]))[0]!.d;
}

/**
 * Inserts a booking directly (fixture) for states the RPC cannot create on purpose,
 * e.g. one that starts right now (check-in) or one in the past (no-show presentation).
 */
export async function insertBookingFixture(u: TestUser, facility: string, startSql: string, minutes = 30) {
  const rows = await q<{ id: string; start_at: string }>(`
    with f as (select id from public.facilities where code = $2),
         a as (select a.id from public.activities a, f where a.facility_id = f.id order by a.sort_order limit 1),
         r as (select r.id from public.resources r, f where r.facility_id = f.id order by r.sort_order limit 1),
         t as (select (${startSql}) as s)
    insert into public.bookings (booking_code, user_id, facility_id, activity_id, resource_id, start_at, end_at)
    select private.new_booking_code(), $1, f.id, a.id, r.id, t.s, t.s + make_interval(mins => $3)
    from f, a, r, t returning id, start_at`, [u.id, facility, minutes]);
  return rows[0]!;
}

/** A :00/:30 start such that "now" is inside its check-in window (−15/+15 min). */
export const CHECKIN_NOW_START = `
  case when now() - (date_trunc('hour', now()) + interval '30 min' * floor(extract(minute from now()) / 30)) <= interval '15 min'
       then date_trunc('hour', now()) + interval '30 min' * floor(extract(minute from now()) / 30)
       else date_trunc('hour', now()) + interval '30 min' * (floor(extract(minute from now()) / 30) + 1) end`;

// ---------- Email (local Mailpit) ----------
export async function latestEmail(to: string, after: number) {
  for (let i = 0; i < 60; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    const m = (list.messages ?? []).find((x: { Created: string }) => new Date(x.Created).getTime() > after);
    if (m) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      const html: string = full.HTML ?? '';
      const link = /href="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
      const code = /letter-spacing:4px">\s*(\d{6})\s*</.exec(html)?.[1];
      return { subject: full.Subject as string, link, code };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no email to ${to}`);
}

// ---------- UI helpers ----------
export async function login(page: Page, u: TestUser) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening|night)/);
}

export async function noHorizontalOverflow(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, 'page must not scroll horizontally').toBeLessThanOrEqual(iw);
}

/** Accessible name of a date chip, tolerant of ICU differences ("Tuesday, 6 October 2026" vs without comma). */
export function dayButton(date: string): RegExp {
  const d = new Date(`${date}T00:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...o }).format(d);
  return new RegExp(`^${part({ weekday: 'long' })},? ${part({ day: 'numeric' })} ${part({ month: 'long' })} ${part({ year: 'numeric' })}$`);
}
