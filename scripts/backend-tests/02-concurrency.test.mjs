// Concurrency tests through the real HTTP stack (Auth JWT -> PostgREST -> create_booking).
//
// Each scenario runs N iterations in two modes:
//   * barrier: a harness transaction holds the row lock every request must take; all
//              requests are fired, the harness waits until PostgreSQL reports every one
//              of them blocked on that lock, then releases -> maximal contention.
//   * free:    requests are simply fired in parallel (natural network timing).
// After every iteration the storage invariants are checked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import {
  adminCreateUser, token, rpc, q, pool, facility, activity, jakartaDate, outcome,
  raceWithBarrier, assertNoOverlaps, tally,
} from './lib.mjs';

const N = Number(process.env.CONCURRENCY_ITERATIONS ?? 100);
const run = Date.now().toString(36);
const summary = [];
const tok = {};
const ids = {};
const F = {};
const A = {};

const RESOURCE_LOCK = 'select 1 from public.resources where facility_id = $1 order by id for update';
const PROFILE_LOCK = 'select 1 from public.profiles where id = $1 for update';

async function user(key) {
  const email = `${key}.${run}@example.com`;
  ids[key] = await adminCreateUser(email, `Load ${key}`);
  tok[key] = await token(email);
}

const book = (key, fac, act, date, time, minutes = 30) => () =>
  rpc(tok[key], 'create_booking', {
    p_facility_id: F[fac], p_activity_id: A[act ?? fac], p_date: date, p_start_time: time, p_duration_minutes: minutes,
  });

async function cancelAllLive(keys) {
  for (const k of keys) {
    const up = await rpc(tok[k], 'get_my_bookings', { p_scope: 'UPCOMING' });
    for (const b of up.body ?? []) {
      if (b.can_cancel) assert.equal((await rpc(tok[k], 'cancel_booking', { p_booking_id: b.id })).status, 200);
    }
  }
}

async function invariants(label) {
  const inv = await assertNoOverlaps();
  assert.deepEqual(inv, { resourceOverlaps: 0, userOverlaps: 0, blockOverlaps: 0 }, `${label}: storage invariants`);
}

async function scenario(name, iterations, body) {
  const outcomes = [];
  const waits = [];
  for (const mode of ['barrier', 'free']) {
    for (let i = 0; i < iterations; i++) {
      const r = await body(mode, i);
      outcomes.push(r.key);
      if (r.waiting !== undefined) waits.push(r.waiting);
      await invariants(`${name} #${i} ${mode}`);
    }
  }
  const entry = {
    scenario: name, iterations_per_mode: iterations, total_runs: iterations * 2,
    outcomes: tally(outcomes),
    barrier_min_waiting: waits.length ? Math.min(...waits) : null,
    violations: 0,
  };
  summary.push(entry);
  console.log(`  ${name}: ${JSON.stringify(entry.outcomes)} (barrier min waiting=${entry.barrier_min_waiting})`);
}

before(async () => {
  for (const code of ['TENNIS', 'BASKETBALL_FUTSAL', 'TABLE_TENNIS', 'FOOTBALL', 'AIR_HOCKEY', 'FOOSBALL']) F[code] = await facility(code);
  for (const code of ['TENNIS', 'BASKETBALL', 'FUTSAL', 'TABLE_TENNIS', 'FOOTBALL', 'AIR_HOCKEY', 'FOOSBALL']) A[code] = await activity(code);
  for (const k of ['s1a', 's1b', 's2a', 's2b', 's2c', 's3a', 's3b', 's3c', 's4', 's5', 's6a', 's6b',
                   's7a', 's7b', 's7c', 's7d', 's8a', 's8b']) await user(k);
  await user('admin');
  await q(`update public.profiles set role = 'ADMIN' where id = $1`, [ids.admin]);
});

after(async () => {
  if (process.env.RESULTS_FILE) writeFileSync(process.env.RESULTS_FILE, JSON.stringify({ iterations_per_mode: N, summary }, null, 2));
  await pool.end();
});

test('1. two users, one Tennis court, same 60-min slot -> exactly one succeeds; cancel then immediate rebook', async () => {
  const day = await jakartaDate(1);
  await scenario('tennis_2_users', N, async (mode) => {
    const fns = [book('s1a', 'TENNIS', 'TENNIS', day, '18:00', 60), book('s1b', 'TENNIS', 'TENNIS', day, '18:00', 60)];
    const { results, waiting } = mode === 'barrier'
      ? await raceWithBarrier(RESOURCE_LOCK, [F.TENNIS], fns)
      : { results: await Promise.all(fns.map((f) => f())) };
    const o = results.map(outcome);
    assert.deepEqual([...o].sort(), ['OK', 'SLOT_UNAVAILABLE'], `exactly one winner, got ${o}`);

    // Cancellation followed immediately by another booking: the loser must now succeed.
    const [winner, loser] = o[0] === 'OK' ? ['s1a', 's1b'] : ['s1b', 's1a'];
    const winnerBooking = results[o[0] === 'OK' ? 0 : 1].body;
    assert.equal((await rpc(tok[winner], 'cancel_booking', { p_booking_id: winnerBooking.id })).status, 200);
    const rebook = await book(loser, 'TENNIS', 'TENNIS', day, '18:00', 60)();
    assert.equal(outcome(rebook), 'OK', 'slot released by cancellation is immediately bookable');
    assert.equal((await rpc(tok[loser], 'cancel_booking', { p_booking_id: rebook.body.id })).status, 200);
    return { key: o.join('+') === 'OK+SLOT_UNAVAILABLE' ? 'A wins' : 'B wins', waiting };
  });
});

for (const [n, code, day] of [[2, 'AIR_HOCKEY', 2], [3, 'FOOSBALL', 3]]) {
  test(`${n}. three users, two ${code} tables -> exactly two succeed on different tables`, async () => {
    const date = await jakartaDate(day);
    const users = [`s${n}a`, `s${n}b`, `s${n}c`];
    await scenario(`${code.toLowerCase()}_3_users_2_tables`, N, async (mode) => {
      const fns = users.map((u) => book(u, code, code, date, '18:00'));
      const { results, waiting } = mode === 'barrier'
        ? await raceWithBarrier(RESOURCE_LOCK, [F[code]], fns)
        : { results: await Promise.all(fns.map((f) => f())) };
      const o = results.map(outcome);
      assert.deepEqual([...o].sort(), ['OK', 'OK', 'SLOT_FULL'], `two winners, got ${o}`);
      const won = results.filter((r) => r.status === 200).map((r) => r.body.id);
      const tables = await q('select distinct resource_id from public.bookings where id = any($1)', [won]);
      assert.equal(tables.length, 2, 'the two winners were allocated two different physical tables');
      await cancelAllLive(users);
      return { key: `loser=${users[o.indexOf('SLOT_FULL')]}`, waiting };
    });
  });
}

test('4. same user, simultaneous overlapping requests -> only a valid combination succeeds', async () => {
  const date = await jakartaDate(4);
  await scenario('same_user_overlap', N, async (mode) => {
    const fns = [
      book('s4', 'TENNIS', 'TENNIS', date, '18:00', 60),        // 18:00-19:00
      book('s4', 'FOOSBALL', 'FOOSBALL', date, '18:30'),        // 18:30-19:00 overlaps Tennis
      book('s4', 'TABLE_TENNIS', 'TABLE_TENNIS', date, '19:00'), // 19:00-19:30 overlaps neither
    ];
    const { results, waiting } = mode === 'barrier'
      ? await raceWithBarrier(PROFILE_LOCK, [ids.s4], fns)
      : { results: await Promise.all(fns.map((f) => f())) };
    const o = results.map(outcome);
    const okIdx = o.flatMap((x, i) => (x === 'OK' ? [i] : []));
    assert.equal(okIdx.length, 2, `exactly 2 succeed (max active = 2), got ${o}`);
    assert.ok(!(okIdx.includes(0) && okIdx.includes(1)), 'never both overlapping bookings');
    for (const x of o.filter((x) => x !== 'OK')) assert.ok(['USER_OVERLAP', 'MAX_ACTIVE_BOOKINGS'].includes(x), x);
    await cancelAllLive(['s4']);

    // Same facility twice on one day, simultaneously.
    const twice = [book('s4', 'FOOTBALL', 'FOOTBALL', date, '10:00'), book('s4', 'FOOTBALL', 'FOOTBALL', date, '15:00')];
    const r2 = mode === 'barrier'
      ? (await raceWithBarrier(PROFILE_LOCK, [ids.s4], twice)).results
      : await Promise.all(twice.map((f) => f()));
    assert.deepEqual(r2.map(outcome).sort(), ['ALREADY_BOOKED_TODAY', 'OK'], 'once per facility per day under concurrency');
    await cancelAllLive(['s4']);
    return { key: `winners=${okIdx.map((i) => ['tennis', 'foosball', 'tabletennis'][i]).join('+')}`, waiting };
  });
});

test('5. booking vs admin block race -> never both; confirmed block cancels a booking that won', async () => {
  const date = await jakartaDate(5);
  await scenario('booking_vs_admin_block', N, async (mode, i) => {
    const confirm = i % 2 === 1; // alternate the two admin modes
    const fns = [
      book('s5', 'TENNIS', 'TENNIS', date, '10:00', 60),
      () => rpc(tok.admin, 'admin_create_block', {
        p_facility_id: F.TENNIS, p_resource_id: null, p_start_date: date, p_start_time: '10:00',
        p_end_date: date, p_end_time: '12:00', p_reason_type: 'MAINTENANCE', p_cancel_conflicts: confirm,
      }),
    ];
    const { results, waiting } = mode === 'barrier'
      ? await raceWithBarrier(RESOURCE_LOCK, [F.TENNIS], fns)
      : { results: await Promise.all(fns.map((f) => f())) };
    const [bk, blk] = results.map(outcome);
    let key;
    if (bk === 'OK' && blk === 'OK') {
      assert.ok(confirm, 'both can only succeed when the admin confirmed cancelling conflicts');
      const st = await q('select status, cancellation_type from public.bookings where id = $1', [results[0].body.id]);
      assert.deepEqual(st[0], { status: 'ADMIN_CANCELLED', cancellation_type: 'SYSTEM_BLOCK' }, 'booking was cancelled by the block');
      key = 'booking first, then block cancelled it';
    } else if (bk === 'OK') {
      assert.equal(blk, 'BLOCK_CONFLICTS');
      key = 'booking first, block refused (conflict)';
    } else {
      assert.equal(bk, 'FACILITY_BLOCKED');
      assert.equal(blk, 'OK');
      key = 'block first, booking refused';
    }
    if (results[1].status === 200) {
      assert.equal((await rpc(tok.admin, 'admin_remove_block', { p_block_id: results[1].body.block.id })).status, 200);
    }
    await cancelAllLive(['s5']);
    return { key, waiting };
  });
});

test('6. cancellation racing a new booking for the same slot -> never two live bookings', async () => {
  const date = await jakartaDate(6);
  await scenario('cancel_vs_rebook_race', N, async () => {
    const held = await book('s6a', 'TENNIS', 'TENNIS', date, '18:00', 60)();
    assert.equal(held.status, 200);
    const [c, b] = await Promise.all([
      rpc(tok.s6a, 'cancel_booking', { p_booking_id: held.body.id }),
      book('s6b', 'TENNIS', 'TENNIS', date, '18:00', 60)(),
    ]);
    assert.equal(c.status, 200, 'cancel always succeeds');
    let key = 'rebook won after cancel committed';
    if (b.status !== 200) {
      assert.equal(outcome(b), 'SLOT_UNAVAILABLE');
      assert.equal(outcome(await book('s6b', 'TENNIS', 'TENNIS', date, '18:00', 60)()), 'OK', 'retry right after cancel succeeds');
      key = 'rebook saw slot still held, retry succeeded';
    }
    const live = await q(`select count(*)::int as n from public.bookings b join public.facilities f on f.id = b.facility_id
                          where f.code = 'TENNIS' and b.local_date = $1 and b.status in ('CONFIRMED','CHECKED_IN')`, [date]);
    assert.equal(live[0].n, 1, 'exactly one live booking for the slot');
    await cancelAllLive(['s6b']);
    return { key };
  });
});

test('7. overlapping 30/60/90-minute requests on one court -> winners never overlap', async () => {
  const date = await jakartaDate(7);
  const reqs = [['s7a', '18:00', 90], ['s7b', '18:30', 60], ['s7c', '19:00', 30], ['s7d', '19:30', 30]];
  const span = ([, t, m]) => { const [h, mm] = t.split(':').map(Number); const s = h * 60 + mm; return [s, s + m]; };
  await scenario('mixed_duration_overlap', N, async (mode) => {
    const fns = reqs.map(([u, t, m]) => book(u, 'TENNIS', 'TENNIS', date, t, m));
    const { results, waiting } = mode === 'barrier'
      ? await raceWithBarrier(RESOURCE_LOCK, [F.TENNIS], fns)
      : { results: await Promise.all(fns.map((f) => f())) };
    const o = results.map(outcome);
    const won = reqs.filter((_, i) => o[i] === 'OK');
    for (let x = 0; x < won.length; x++) for (let y = x + 1; y < won.length; y++) {
      const [a1, a2] = span(won[x]); const [b1, b2] = span(won[y]);
      assert.ok(a2 <= b1 || b2 <= a1, `winners overlap: ${won[x]} vs ${won[y]}`);
    }
    assert.equal(o[3], 'OK', '19:30-20:00 overlaps no other request, so it always succeeds');
    for (const x of o.filter((x) => x !== 'OK')) assert.equal(x, 'SLOT_UNAVAILABLE');
    await cancelAllLive(reqs.map(([u]) => u));
    return { key: `winners=${won.map(([, t, m]) => `${t}/${m}`).join(',')}`, waiting };
  });
});

test('8. Basketball vs Futsal for the same court and time -> exactly one succeeds', async () => {
  const date = await jakartaDate(1);
  await scenario('basketball_vs_futsal', N, async (mode) => {
    const fns = [
      book('s8a', 'BASKETBALL_FUTSAL', 'BASKETBALL', date, '08:00', 60),
      book('s8b', 'BASKETBALL_FUTSAL', 'FUTSAL', date, '08:00', 60),
    ];
    const { results, waiting } = mode === 'barrier'
      ? await raceWithBarrier(RESOURCE_LOCK, [F.BASKETBALL_FUTSAL], fns)
      : { results: await Promise.all(fns.map((f) => f())) };
    const o = results.map(outcome);
    assert.deepEqual([...o].sort(), ['OK', 'SLOT_UNAVAILABLE'], `one winner, got ${o}`);
    await cancelAllLive(['s8a', 's8b']);
    return { key: o[0] === 'OK' ? 'Basketball won' : 'Futsal won', waiting };
  });
});

test('global invariants after all races', async () => {
  await invariants('final');
  const live = await q(`select count(*)::int as n from public.bookings where status in ('CONFIRMED','CHECKED_IN')
                        and user_id = any($1)`, [Object.values(ids)]);
  assert.equal(live[0].n, 0, 'every test booking was cleaned up through cancel_booking');
});
