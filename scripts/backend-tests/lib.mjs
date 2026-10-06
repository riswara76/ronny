// Shared helpers for the HTTP-level backend tests.
// Every request goes through the real stack: Supabase Auth -> JWT -> PostgREST -> RPC.
// Configuration comes from the environment; nothing secret is stored in this repo.
import pg from 'pg';

const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_DB_URL'];
for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing env ${name}. Run scripts/run-backend-tests.sh (local) or export it.`);
  }
}

export const URL_BASE = process.env.SUPABASE_URL.replace(/\/$/, '');
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
export const MAILPIT_URL = process.env.MAILPIT_URL?.replace(/\/$/, '');
export const TEST_PASSWORD = process.env.DCU_TEST_PASSWORD ?? `Local-only-${Math.random().toString(36).slice(2)}!9`;

export const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, max: 10 });

async function http(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

// ---------- Auth ----------
export async function adminCreateUser(email, fullName, { confirmed = true } = {}) {
  const r = await http('POST', '/auth/v1/admin/users', {
    headers: { apikey: SECRET, authorization: `Bearer ${SECRET}` },
    body: { email, password: TEST_PASSWORD, email_confirm: confirmed, user_metadata: { full_name: fullName } },
  });
  if (r.status !== 200) throw new Error(`create user ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.id;
}

export async function signUp(email, fullName, password = TEST_PASSWORD) {
  return http('POST', '/auth/v1/signup', {
    headers: { apikey: PUBLISHABLE },
    body: { email, password, data: { full_name: fullName } },
  });
}

export async function signIn(email, password = TEST_PASSWORD) {
  return http('POST', '/auth/v1/token?grant_type=password', {
    headers: { apikey: PUBLISHABLE },
    body: { email, password },
  });
}

export async function token(email) {
  const r = await signIn(email);
  if (r.status !== 200) throw new Error(`sign in ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.access_token;
}

export async function verifyOtp(email, code, type) {
  return http('POST', '/auth/v1/verify', { headers: { apikey: PUBLISHABLE }, body: { email, token: code, type } });
}

export async function recover(email) {
  return http('POST', '/auth/v1/recover', { headers: { apikey: PUBLISHABLE }, body: { email } });
}

export async function updatePassword(accessToken, password) {
  return http('PUT', '/auth/v1/user', {
    headers: { apikey: PUBLISHABLE, authorization: `Bearer ${accessToken}` },
    body: { password },
  });
}

// Reads the newest 6-digit code mailed to `email` from the local Mailpit inbox.
export async function latestCode(email, { after = 0 } = {}) {
  if (!MAILPIT_URL) throw new Error('MAILPIT_URL not set');
  for (let i = 0; i < 50; i++) {
    const list = await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    const msg = (list.messages ?? []).find((m) => new Date(m.Created).getTime() > after);
    if (msg) {
      const full = await (await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)).json();
      const m = /\b(\d{6})\b/.exec(full.Text ?? full.HTML ?? '');
      if (m) return { code: m[1], subject: full.Subject };
    }
    await sleep(200);
  }
  throw new Error(`no code email for ${email}`);
}

// ---------- Data API ----------
export async function rpc(accessToken, fn, args = {}) {
  const headers = { apikey: PUBLISHABLE };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return http('POST', `/rest/v1/rpc/${fn}`, { headers, body: args });
}

export async function rest(accessToken, method, path, body) {
  const headers = { apikey: PUBLISHABLE, prefer: 'return=representation' };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return http(method, `/rest/v1/${path}`, { headers, body });
}

// ---------- Database (test harness only) ----------
export async function q(sql, params) {
  return (await pool.query(sql, params)).rows;
}

export const facility = async (code) => (await q('select id from public.facilities where code = $1', [code]))[0].id;
export const activity = async (code) => (await q('select id from public.activities where code = $1', [code]))[0].id;

export async function jakartaDate(offsetDays) {
  return (await q(`select ((now() at time zone 'Asia/Jakarta')::date + $1::int)::text as d`, [offsetDays]))[0].d;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Result classifier: 'OK' or the stable error code returned by the RPC.
export const outcome = (r) => (r.status === 200 ? 'OK' : r.body?.message ?? `HTTP_${r.status}`);

/**
 * Deterministic race barrier.
 * Holds a row lock that every request in the batch must take, fires all requests,
 * waits until all of them are blocked on that lock inside PostgreSQL, then releases.
 * All requests therefore hit the critical section at the same instant.
 */
export async function raceWithBarrier(lockSql, lockParams, requestFns, { expectWaiting = requestFns.length } = {}) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(lockSql, lockParams);
    const holderPid = (await client.query('select pg_backend_pid() as pid')).rows[0].pid;
    const inflight = requestFns.map((fn) => fn());
    let waiting = 0;
    for (let i = 0; i < 200; i++) {
      waiting = Number((await q(
        `select count(*) as n from pg_stat_activity
         where wait_event_type = 'Lock' and backend_type = 'client backend' and pid <> $1`, [holderPid]))[0].n);
      if (waiting >= expectWaiting) break;
      await sleep(10);
    }
    await client.query('commit');
    const results = await Promise.all(inflight);
    return { results, waiting };
  } finally {
    client.release();
  }
}

// Storage-level invariants that must hold after every scenario.
export async function assertNoOverlaps() {
  const resourceOverlaps = await q(`
    select count(*)::int as n from public.bookings a join public.bookings b
      on a.resource_id = b.resource_id and a.id < b.id and a.time_range && b.time_range
    where a.status in ('CONFIRMED','CHECKED_IN') and b.status in ('CONFIRMED','CHECKED_IN')`);
  const userOverlaps = await q(`
    select count(*)::int as n from public.bookings a join public.bookings b
      on a.user_id = b.user_id and a.id < b.id and a.time_range && b.time_range
    where a.status in ('CONFIRMED','CHECKED_IN') and b.status in ('CONFIRMED','CHECKED_IN')`);
  const blockOverlaps = await q(`
    select count(*)::int as n from public.bookings b join public.facility_blocks k
      on k.facility_id = b.facility_id and (k.resource_id is null or k.resource_id = b.resource_id)
     and k.removed_at is null and k.time_range && b.time_range
    where b.status in ('CONFIRMED','CHECKED_IN')`);
  return { resourceOverlaps: resourceOverlaps[0].n, userOverlaps: userOverlaps[0].n, blockOverlaps: blockOverlaps[0].n };
}

export function tally(list) {
  return list.reduce((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
}

// First slot on `date` that can take a booking of `minutes` (according to the server).
export async function firstFreeSlot(accessToken, facilityId, date, minutes = 30) {
  const r = await rpc(accessToken, 'get_availability', { p_facility_id: facilityId, p_date: date });
  if (r.status !== 200) throw new Error(`availability: ${JSON.stringify(r.body)}`);
  const slot = r.body.find((s) => s.status === 'AVAILABLE' && s.max_duration_minutes >= minutes);
  if (!slot) throw new Error(`no free ${minutes}-min slot on ${date}`);
  return slot.slot_start.slice(0, 5);
}
