-- Cancellation, check-in window, no-show (D5), completion, status-transition guards.
-- Clock starts Mon 2030-01-07 09:05 WIB and is moved forward during the test.
begin;
\ir _helpers.psql
select plan(33);

select tests.create_user(k) from unnest(array['u1','u2','u3','u4','u5','u6','u7']) k;

-- Bookings made at 09:05 for later today.
select tests.login('u1');
select (tests.book('TABLE_TENNIS', '2030-01-07', '10:00')) ->> 'id' as b_tt \gset
reset role; select tests.login('u3');
select (tests.book('FOOTBALL', '2030-01-07', '10:00')) ->> 'id' as b_fb \gset
reset role; select tests.login('u4');
select (tests.book('FOOSBALL', '2030-01-07', '10:00')) ->> 'id' as b_fs \gset
reset role; select tests.login('u5');
select (tests.book('TENNIS', '2030-01-07', '10:00', 90)) ->> 'id' as b_tn \gset
reset role; select tests.login('u7');
select (tests.book('AIR_HOCKEY', '2030-01-07', '09:30')) ->> 'id' as b_ah \gset
reset role;

-- ============ Cancellation releases the resource immediately ============
select tests.login('u2');
select is(tests.slot_status('TABLE_TENNIS', '2030-01-07', '10:00'), 'BOOKED', 'u2 sees Table Tennis 10:00 BOOKED');
select throws_ok(format('select public.cancel_booking(%L)', :'b_tt'), 'P0001', 'BOOKING_NOT_FOUND',
  'u2 cannot cancel u1''s booking (and cannot tell it exists)');
reset role; select tests.login('u1');
select is((public.cancel_booking(:'b_tt')) ->> 'status', 'CANCELLED', 'u1 cancels own future booking');
select throws_ok(format('select public.cancel_booking(%L)', :'b_tt'), 'P0001', 'BOOKING_NOT_CANCELLABLE', 'cannot cancel twice');
reset role; select tests.login('u2');
select is(tests.slot_status('TABLE_TENNIS', '2030-01-07', '10:00'), 'AVAILABLE', 'slot is AVAILABLE right after cancellation');
select lives_ok($$select tests.book('TABLE_TENNIS', '2030-01-07', '10:00')$$, 'u2 books the released slot immediately');
reset role;
select results_eq(format($$select cancelled_by, cancellation_type from public.bookings where id = %L$$, :'b_tt'),
  format($$values (%L::uuid, 'USER')$$, tests.uid('u1')), 'cancellation audit fields recorded');
select is((select count(*)::int from public.bookings where id = :'b_tt'), 1, 'cancelled booking row is kept (never deleted)');

-- ============ Cannot cancel once started ============
select tests.set_now('2030-01-07 09:30:00+07');
select tests.login('u7');
select throws_ok(format('select public.cancel_booking(%L)', :'b_ah'), 'P0001', 'CANNOT_CANCEL_STARTED', 'cancel at start time rejected');
reset role;

-- ============ Check-in window: 09:45 .. 10:15 for a 10:00 booking ============
select tests.set_now('2030-01-07 09:44:59+07');
select tests.login('u3');
select throws_ok(format('select public.check_in(%L)', :'b_fb'), 'P0001', 'CHECKIN_TOO_EARLY', 'check-in at 09:44:59 too early');
select is((public.get_booking(:'b_fb')) ->> 'can_check_in', 'false', 'can_check_in false before the window');
reset role;
select tests.set_now('2030-01-07 09:45:00+07');
select tests.login('u3');
select is((public.get_booking(:'b_fb')) ->> 'can_check_in', 'true', 'can_check_in true at 09:45');
select is((public.check_in(:'b_fb')) ->> 'status', 'CHECKED_IN', 'check-in at 09:45 succeeds');
select throws_ok(format('select public.check_in(%L)', :'b_fb'), 'P0001', 'ALREADY_CHECKED_IN', 'second check-in rejected');
select throws_ok(format('select public.cancel_booking(%L)', :'b_fb'), 'P0001', 'BOOKING_NOT_CANCELLABLE', 'checked-in booking cannot be cancelled by user');
select throws_ok(format('select public.check_in(%L)', :'b_fs'), 'P0001', 'BOOKING_NOT_FOUND', 'cannot check in someone else''s booking');
reset role;
select ok((select checked_in_at is not null and check_in_method = 'BUTTON' from public.bookings where id = :'b_fb'),
  'checked_in_at and method recorded');

select tests.set_now('2030-01-07 10:15:00+07');
select tests.login('u4');
select is((public.get_booking(:'b_fs')) ->> 'can_check_in', 'true', 'check-in still allowed at exactly 10:15');
reset role;
select tests.set_now('2030-01-07 10:15:01+07');
select tests.login('u4');
select throws_ok(format('select public.check_in(%L)', :'b_fs'), 'P0001', 'CHECKIN_EXPIRED', 'check-in at 10:15:01 expired');
select is((public.get_booking(:'b_fs')) ->> 'effective_status', 'NO_SHOW', 'shows NO_SHOW before the job runs');
select is(jsonb_array_length(public.get_my_bookings('UPCOMING')), 0, 'no-show no longer listed as upcoming');
select is((public.get_my_bookings('HISTORY')) -> 0 ->> 'effective_status', 'NO_SHOW', 'no-show listed in history');
-- A no-show no longer counts towards the 2-booking limit.
select lives_ok($$select tests.book('TENNIS', '2030-01-08', '06:00')$$, 'no-show frees quota: booking 1');
select lives_ok($$select tests.book('FOOTBALL', '2030-01-08', '06:30')$$, 'no-show frees quota: booking 2');
reset role;

-- ============ D5: no-show releases the rest of a 90-minute booking ============
select tests.set_now('2030-01-07 10:16:00+07');
select tests.login('u6');
select is(tests.slot_status('TENNIS', '2030-01-07', '10:30'), 'AVAILABLE', 'Tennis 10:30 released after u5''s 10:00 no-show');
select is((tests.book('TENNIS', '2030-01-07', '10:30', 60)) ->> 'end_time', '11:30', 'u6 books Tennis 10:30-11:30 inside u5''s old range');
reset role;
select is((select status from public.bookings where id = :'b_tn'), 'NO_SHOW', 'create_booking rewrote the stale booking to NO_SHOW');

-- ============ Lifecycle job ============
select tests.set_now('2030-01-07 10:30:00+07');
select is(private.sweep_lifecycle(), '{"no_shows": 2, "completed": 1}'::jsonb, 'sweep marks the 2 remaining stale bookings NO_SHOW and 1 COMPLETED');
select is((select status from public.bookings where id = :'b_fb'), 'COMPLETED', 'checked-in booking COMPLETED after its end');
select is((select status from public.bookings where id = :'b_fs'), 'NO_SHOW', 'unclaimed booking stored as NO_SHOW');

-- ============ Guards on direct writes (even for privileged roles) ============
select throws_ok(format($$update public.bookings set status = 'CONFIRMED' where id = %L$$, :'b_fb'),
  'P0001', 'INVALID_STATUS_TRANSITION', 'COMPLETED -> CONFIRMED is impossible');
select throws_ok(format($$update public.bookings set start_at = start_at + interval '30 minutes' where id = %L$$, :'b_fb'),
  'P0001', 'BOOKING_IMMUTABLE', 'booking time cannot be edited');
select throws_ok(format($$delete from public.bookings where id = %L$$, :'b_fb'),
  'P0001', 'BOOKING_DELETE_FORBIDDEN', 'bookings can never be deleted');

select * from finish();
rollback;
