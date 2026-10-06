-- Booking engine rules. Clock: Mon 2030-01-07 09:05 WIB (horizon ends 2030-01-14).
begin;
\ir _helpers.psql
select plan(55);

select tests.create_user('alice');
select tests.create_user('bob');
select tests.create_user('carol');
select tests.create_user('dave');

-- ============ Durations ============
select tests.login('alice');
select is((tests.book('TENNIS', '2030-01-08', '06:00', 30)) ->> 'duration_minutes', '30', '30-minute Tennis booking');
reset role; select tests.login('bob');
select is((tests.book('TENNIS', '2030-01-08', '07:00', 60)) ->> 'end_time', '08:00', '60-minute Tennis booking ends 08:00');
reset role; select tests.login('carol');
select is((tests.book('TENNIS', '2030-01-08', '19:30', 90)) ->> 'end_time', '21:00', '90-minute booking may end exactly at 21:00');
reset role; select tests.login('dave');
select throws_ok($$select tests.book('TENNIS', '2030-01-09', '18:00', 120)$$, 'P0001', 'INVALID_DURATION', 'Tennis 120 min rejected');
select throws_ok($$select tests.book('TENNIS', '2030-01-09', '18:00', 45)$$, 'P0001', 'INVALID_DURATION', '45 min rejected');
select throws_ok($$select tests.book('TABLE_TENNIS', '2030-01-09', '18:00', 60)$$, 'P0001', 'INVALID_DURATION', 'Table Tennis max 30 min');
select throws_ok($$select tests.book('AIR_HOCKEY', '2030-01-09', '18:00', 60)$$, 'P0001', 'INVALID_DURATION', 'Air Hockey max 30 min');
select throws_ok($$select tests.book('FOOTBALL', '2030-01-09', '18:00', 90)$$, 'P0001', 'INVALID_DURATION', 'Football max 30 min');

-- ============ Alignment & operating hours ============
select throws_ok($$select tests.book('TENNIS', '2030-01-09', '18:15', 30)$$, 'P0001', 'INVALID_START_TIME', '18:15 is not a slot boundary');
select throws_ok($$select tests.book('TENNIS', '2030-01-09', '05:30', 30)$$, 'P0001', 'OUTSIDE_HOURS', 'before 06:00 rejected');
select throws_ok($$select tests.book('TENNIS', '2030-01-09', '21:00', 30)$$, 'P0001', 'OUTSIDE_HOURS', 'starting at 21:00 rejected');
select throws_ok($$select tests.book('TENNIS', '2030-01-09', '20:30', 60)$$, 'P0001', 'OUTSIDE_HOURS', '20:30 + 60 min would pass 21:00');
select throws_ok($$select tests.book('TENNIS', '2030-01-09', '20:00', 90)$$, 'P0001', 'OUTSIDE_HOURS', '20:00 + 90 min would pass 21:00');
select is((select count(*)::int from public.get_availability(tests.fac('TENNIS'), '2030-01-09')), 30,
  '30 slots per day: 06:00 .. 20:30');
select is((select max_duration_minutes from public.get_availability(tests.fac('TENNIS'), '2030-01-09') where slot_start = '20:00'), 60,
  'at 20:00 the longest possible booking is 60 min');

-- ============ Booking horizon (D4) & past slots (D8) ============
select lives_ok($$select tests.book('FOOTBALL', '2030-01-14', '18:00', 30)$$, 'today + 7 (2030-01-14) is bookable');
select throws_ok($$select tests.book('TABLE_TENNIS', '2030-01-15', '18:00', 30)$$, 'P0001', 'OUTSIDE_HORIZON', 'today + 8 rejected');
select throws_ok($$select tests.book('TABLE_TENNIS', '2030-01-06', '18:00', 30)$$, 'P0001', 'OUTSIDE_HORIZON', 'yesterday rejected');
select throws_ok($$select public.get_availability(tests.fac('TENNIS'), '2030-01-15')$$, 'P0001', 'OUTSIDE_HORIZON', 'availability beyond horizon rejected');
select throws_ok($$select tests.book('TABLE_TENNIS', '2030-01-07', '09:00', 30)$$, 'P0001', 'PAST_SLOT', 'slot that started at 09:00 (now 09:05) rejected');
select is(tests.slot_status('TABLE_TENNIS', '2030-01-07', '09:00'), 'PAST', '09:00 shows PAST at 09:05');
select is(tests.slot_status('TABLE_TENNIS', '2030-01-07', '09:30'), 'AVAILABLE', '09:30 is still bookable today');
reset role;

-- ============ Max 2 active bookings ============
-- dave has 1 (Football 14th). Second succeeds, third fails.
select tests.login('dave');
select lives_ok($$select tests.book('FOOSBALL', '2030-01-10', '10:00', 30)$$, 'second active booking allowed');
select throws_ok($$select tests.book('TABLE_TENNIS', '2030-01-11', '10:00', 30)$$, 'P0001', 'MAX_ACTIVE_BOOKINGS', 'third active booking rejected');
reset role;

-- ============ Once per facility per day, cancellation frees the quota ============
select tests.create_user('erin');
select tests.login('erin');
select lives_ok($$select tests.book('TABLE_TENNIS', '2030-01-09', '10:00', 30)$$, 'first Table Tennis booking of the day');
select throws_ok($$select tests.book('TABLE_TENNIS', '2030-01-09', '15:00', 30)$$, 'P0001', 'ALREADY_BOOKED_TODAY', 'second same-facility booking same day rejected');
select lives_ok($$select tests.book('TABLE_TENNIS', '2030-01-10', '15:00', 30)$$, 'same facility on another day is fine');
select lives_ok($$select public.cancel_booking((select id from public.bookings where user_id = tests.uid('erin') and local_date = '2030-01-09'))$$, 'cancel it');
select lives_ok($$select tests.book('TABLE_TENNIS', '2030-01-09', '15:00', 30)$$, 'after cancelling, the facility can be booked again that day');
reset role;

-- ============ Same-user overlap across facilities ============
select tests.create_user('frank');
select tests.login('frank');
select lives_ok($$select tests.book('TENNIS', '2030-01-12', '18:00', 60)$$, 'Tennis 18:00-19:00');
select throws_ok($$select tests.book('FOOSBALL', '2030-01-12', '18:30', 30)$$, 'P0001', 'USER_OVERLAP', 'Foosball 18:30 overlaps own Tennis booking');
select lives_ok($$select tests.book('FOOSBALL', '2030-01-12', '19:00', 30)$$, 'Foosball 19:00 (touching, not overlapping) is fine');
reset role;

-- ============ Resource conflicts with 30/60/90 overlaps (Tennis, 2030-01-13) ============
select tests.create_user('u1'); select tests.create_user('u2'); select tests.create_user('u3'); select tests.create_user('u4');
select tests.login('u1');
select lives_ok($$select tests.book('TENNIS', '2030-01-13', '18:00', 60)$$, 'u1 holds Tennis 18:00-19:00');
reset role; select tests.login('u2');
select throws_ok($$select tests.book('TENNIS', '2030-01-13', '17:00', 90)$$, 'P0001', 'SLOT_UNAVAILABLE', '17:00-18:30 overlaps the tail -> rejected');
select throws_ok($$select tests.book('TENNIS', '2030-01-13', '18:30', 30)$$, 'P0001', 'SLOT_UNAVAILABLE', '18:30-19:00 inside -> rejected');
select throws_ok($$select tests.book('TENNIS', '2030-01-13', '18:30', 90)$$, 'P0001', 'SLOT_UNAVAILABLE', '18:30-20:00 overlaps the head -> rejected');
select is((tests.book('TENNIS', '2030-01-13', '19:00', 90)) ->> 'start_time', '19:00', '19:00-20:30 right after -> allowed');
reset role; select tests.login('u3');
select is((tests.book('TENNIS', '2030-01-13', '17:00', 60)) ->> 'end_time', '18:00', '17:00-18:00 right before -> allowed');
select is((select max_duration_minutes from public.get_availability(tests.fac('TENNIS'), '2030-01-13') where slot_start = '16:00'), 60,
  '16:00 can be at most 60 min (17:00 is taken): fragmented bookings impossible');
select is(tests.slot_status('TENNIS', '2030-01-13', '18:30'), 'BOOKED', 'single-court slot shows BOOKED to others');
reset role;

-- ============ Basketball vs Futsal share one court ============
select tests.login('u1');
select lives_ok($$select tests.book('BASKETBALL_FUTSAL', '2030-01-11', '18:00', 60, 'BASKETBALL')$$, 'u1 books Basketball 18:00-19:00');
reset role; select tests.login('u4');
select throws_ok($$select tests.book('BASKETBALL_FUTSAL', '2030-01-11', '18:00', 60, 'FUTSAL')$$, 'P0001', 'SLOT_UNAVAILABLE', 'Futsal at the same time is rejected');
select is(tests.slot_status('BASKETBALL_FUTSAL', '2030-01-11', '18:30'), 'BOOKED', 'court shows BOOKED for both activities');
select throws_ok($$select public.create_booking(tests.fac('TENNIS'), tests.act('FUTSAL'), '2030-01-11', '10:00', 30)$$,
  'P0001', 'INVALID_ACTIVITY', 'activity of another facility rejected');
reset role;
-- D7: Basketball then Futsal on the same day by the same user.
select tests.login('u1');
select throws_ok($$select tests.book('BASKETBALL_FUTSAL', '2030-01-11', '20:00', 30, 'FUTSAL')$$, 'P0001', 'MAX_ACTIVE_BOOKINGS',
  'u1 is at 2 active bookings already');
reset role;
select tests.create_user('gina');
select tests.login('gina');
select lives_ok($$select tests.book('BASKETBALL_FUTSAL', '2030-01-10', '08:00', 30, 'BASKETBALL')$$, 'gina books Basketball');
select throws_ok($$select tests.book('BASKETBALL_FUTSAL', '2030-01-10', '15:00', 30, 'FUTSAL')$$, 'P0001', 'ALREADY_BOOKED_TODAY',
  'Basketball and Futsal count as the same facility per day (D7)');
reset role;

-- ============ Air Hockey & Foosball automatic allocation ============
select tests.create_user('h1'); select tests.create_user('h2'); select tests.create_user('h3');
select tests.login('h1');
select is(tests.resource_of(tests.book('AIR_HOCKEY', '2030-01-09', '18:00')), 'Air Hockey Table 1', 'first Air Hockey booking gets Table 1');
reset role; select tests.login('h2');
select is((select available_count from public.get_availability(tests.fac('AIR_HOCKEY'), '2030-01-09') where slot_start = '18:00'), 1,
  'slot still AVAILABLE with 1 table left');
select is(tests.resource_of(tests.book('AIR_HOCKEY', '2030-01-09', '18:00')), 'Air Hockey Table 2', 'second booking is auto-allocated Table 2');
reset role; select tests.login('h3');
select is(tests.slot_status('AIR_HOCKEY', '2030-01-09', '18:00'), 'FULL', 'both tables taken -> FULL');
select throws_ok($$select tests.book('AIR_HOCKEY', '2030-01-09', '18:00')$$, 'P0001', 'SLOT_FULL', 'third Air Hockey booking rejected');
reset role;

select tests.login('h1');
select is(tests.resource_of(tests.book('FOOSBALL', '2030-01-09', '19:00')), 'Foosball Table 1', 'Foosball: first gets Table 1');
reset role; select tests.login('h2');
select is(tests.resource_of(tests.book('FOOSBALL', '2030-01-09', '19:00')), 'Foosball Table 2', 'Foosball: second gets Table 2');
reset role; select tests.login('h3');
select throws_ok($$select tests.book('FOOSBALL', '2030-01-09', '19:00')$$, 'P0001', 'SLOT_FULL', 'Foosball: third rejected');
reset role;

select * from finish();
rollback;
