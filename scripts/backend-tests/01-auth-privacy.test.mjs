// Real Auth flows and privacy over HTTP (PostgREST + RLS), using separate signed-in users.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminCreateUser, signUp, signIn, token, verifyOtp, recover, updatePassword, latestCode,
  rpc, rest, q, pool, facility, activity, jakartaDate, outcome, firstFreeSlot, MAILPIT_URL,
} from './lib.mjs';

const run = Date.now().toString(36);
const email = (k) => `${k}.${run}@example.com`;
let tennis, tennisAct, day;

before(async () => {
  tennis = await facility('TENNIS');
  tennisAct = await activity('TENNIS');
  day = await jakartaDate(2);
});
after(() => pool.end());

test('registration: any email domain, verification code required before login (D1, D2)', { skip: !MAILPIT_URL }, async () => {
  const e = email('newbie').replace('@example.com', '@gmail.com');
  const t0 = Date.now() - 1000;
  const su = await signUp(e, 'New Participant');
  assert.equal(su.status, 200, JSON.stringify(su.body));

  const early = await signIn(e);
  assert.equal(early.status, 400);
  assert.equal(early.body.error_code, 'email_not_confirmed', 'unverified user cannot obtain a session');

  const { code, subject } = await latestCode(e, { after: t0 });
  assert.match(subject, /verification code/i);
  const wrong = await verifyOtp(e, code === '000000' ? '111111' : '000000', 'signup');
  assert.notEqual(wrong.status, 200, 'wrong code rejected');
  const ok = await verifyOtp(e, code, 'signup');
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  const cfg = await rpc(ok.body.access_token, 'get_app_config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.is_admin, false, 'new users are never admin');
  const prof = await rest(ok.body.access_token, 'GET', 'profiles?select=full_name,role');
  assert.deepEqual(prof.body, [{ full_name: 'New Participant', role: 'USER' }]);
});

test('password reset by emailed code', { skip: !MAILPIT_URL }, async () => {
  const e = email('forgetful');
  await adminCreateUser(e, 'Forgetful User');
  const t0 = Date.now() - 1000;
  assert.equal((await recover(e)).status, 200);
  const { code, subject } = await latestCode(e, { after: t0 });
  assert.match(subject, /password reset/i);
  const v = await verifyOtp(e, code, 'recovery');
  assert.equal(v.status, 200, JSON.stringify(v.body));
  const newPassword = `New-${Math.random().toString(36).slice(2)}!7`;
  assert.equal((await updatePassword(v.body.access_token, newPassword)).status, 200);
  assert.equal((await signIn(e, newPassword)).status, 200, 'can log in with the new password');
});

test('privacy: user B cannot retrieve user A\'s bookings or profile through any Data API path', async () => {
  await adminCreateUser(email('alice'), 'Alice Private');
  await adminCreateUser(email('bob'), 'Bob Curious');
  const a = await token(email('alice'));
  const b = await token(email('bob'));

  const start = await firstFreeSlot(a, tennis, day, 60);
  const booked = await rpc(a, 'create_booking', {
    p_facility_id: tennis, p_activity_id: tennisAct, p_date: day, p_start_time: start, p_duration_minutes: 60,
  });
  assert.equal(booked.status, 200, JSON.stringify(booked.body));
  const aliceBookingId = booked.body.id;
  const aliceId = (await q('select id from public.profiles where email = $1', [email('alice')]))[0].id;

  const all = await rest(b, 'GET', 'bookings?select=*');
  assert.deepEqual(all.body, [], 'table read returns none of A\'s rows');
  const byId = await rest(b, 'GET', `bookings?id=eq.${aliceBookingId}&select=*`);
  assert.deepEqual(byId.body, [], 'filter by A\'s booking id returns nothing');
  const byUser = await rest(b, 'GET', `bookings?user_id=eq.${aliceId}&select=*`);
  assert.deepEqual(byUser.body, [], 'filter by A\'s user id returns nothing');
  const profiles = await rest(b, 'GET', 'profiles?select=email');
  assert.deepEqual(profiles.body, [{ email: email('bob') }], 'only own profile visible');
  const embedded = await rest(b, 'GET', 'facilities?select=code,bookings(id,user_id),resources(bookings(id))');
  assert.equal(embedded.status, 200);
  assert.ok(embedded.body.every((f) => f.bookings.length === 0 && f.resources.every((r) => r.bookings.length === 0)),
    'embedding bookings through facilities/resources is still filtered by RLS (no rows of A)');

  const detail = await rpc(b, 'get_booking', { p_booking_id: aliceBookingId });
  assert.equal(outcome(detail), 'BOOKING_NOT_FOUND');
  const cancel = await rpc(b, 'cancel_booking', { p_booking_id: aliceBookingId });
  assert.equal(outcome(cancel), 'BOOKING_NOT_FOUND', 'cannot cancel another user\'s booking');
  const checkin = await rpc(b, 'check_in', { p_booking_id: aliceBookingId });
  assert.equal(outcome(checkin), 'BOOKING_NOT_FOUND', 'cannot check in another user\'s booking');

  const avail = await rpc(b, 'get_availability', { p_facility_id: tennis, p_date: day });
  const slot = avail.body.find((s) => s.slot_start === `${start}:00`);
  assert.equal(slot.status, 'BOOKED');
  assert.deepEqual(Object.keys(slot).sort(),
    ['available_count', 'block_reason', 'max_duration_minutes', 'slot_end', 'slot_start', 'status', 'total_count'],
    'availability rows carry no identity');
  assert.ok(!JSON.stringify(avail.body).includes(aliceId) && !JSON.stringify(avail.body).includes('Alice'),
    'no trace of A in availability payload');

  for (const fn of ['admin_list_bookings', 'admin_list_users', 'admin_dashboard', 'admin_list_blocks']) {
    assert.equal(outcome(await rpc(b, fn)), 'NOT_AUTHORIZED', `${fn} denied to normal user`);
  }
  assert.deepEqual((await rest(b, 'GET', 'admin_actions?select=*')).body, [], 'audit log invisible');
  assert.deepEqual((await rest(b, 'GET', 'facility_blocks?select=*')).body, [], 'blocks table invisible');
});

test('privacy: direct writes and privilege escalation are refused', async () => {
  const b = await token(email('bob'));
  const bobId = (await q('select id from public.profiles where email = $1', [email('bob')]))[0].id;

  const ins = await rest(b, 'POST', 'bookings', {
    booking_code: 'DCU-ZZZZZZ', user_id: bobId, facility_id: tennis, activity_id: tennisAct,
    resource_id: (await q('select id from public.resources where facility_id = $1', [tennis]))[0].id,
    start_at: `${day}T10:00:00+07:00`, end_at: `${day}T10:30:00+07:00`,
  });
  assert.ok([401, 403].includes(ins.status), `direct insert refused (${ins.status})`);

  const role = await rest(b, 'PATCH', `profiles?id=eq.${bobId}`, { role: 'ADMIN' });
  assert.ok([401, 403].includes(role.status), `role escalation refused (${role.status})`);
  assert.equal((await q('select role from public.profiles where id = $1', [bobId]))[0].role, 'USER');

  const name = await rest(b, 'PATCH', `profiles?id=eq.${bobId}`, { full_name: 'Bob Renamed' });
  assert.equal(name.status, 200, 'own name can be changed');

  const settings = await rest(b, 'PATCH', 'app_settings?id=eq.true', { max_active_bookings: 10 });
  assert.ok([401, 403].includes(settings.status), 'settings cannot be changed directly');
});

test('signed-out callers get nothing', async () => {
  assert.equal((await rest(null, 'GET', 'facilities?select=code')).status, 401);
  assert.equal((await rest(null, 'GET', 'bookings?select=*')).status, 401);
  const r = await rpc(null, 'get_availability', { p_facility_id: tennis, p_date: day });
  assert.ok([401, 404].includes(r.status), `anon RPC refused (${r.status})`);
});

test('deactivated user loses booking RPC access immediately, with the same still-valid JWT', async () => {
  await adminCreateUser(email('admin'), 'Ada Admin');
  await q(`update public.profiles set role = 'ADMIN' where email = $1`, [email('admin')]);
  await adminCreateUser(email('dan'), 'Dan Departing');
  const admin = await token(email('admin'));
  const dan = await token(email('dan'));
  const danId = (await q('select id from public.profiles where email = $1', [email('dan')]))[0].id;

  const ok = await rpc(dan, 'create_booking', {
    p_facility_id: await facility('FOOTBALL'), p_activity_id: await activity('FOOTBALL'),
    p_date: day, p_start_time: await firstFreeSlot(dan, await facility('FOOTBALL'), day), p_duration_minutes: 30,
  });
  assert.equal(ok.status, 200);

  const deact = await rpc(admin, 'admin_set_user_active', { p_user_id: danId, p_active: false, p_reason: 'left' });
  assert.equal(deact.status, 200, JSON.stringify(deact.body));
  assert.equal(deact.body.cancelled_bookings, 1, 'future booking released');

  const again = await rpc(dan, 'create_booking', {
    p_facility_id: await facility('FOOTBALL'), p_activity_id: await activity('FOOTBALL'),
    p_date: day, p_start_time: '08:00', p_duration_minutes: 30,
  });
  assert.equal(outcome(again), 'ACCOUNT_DISABLED');
  assert.equal(outcome(await rpc(dan, 'get_my_bookings')), 'ACCOUNT_DISABLED');
});
