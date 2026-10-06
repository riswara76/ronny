-- Privacy: one normal user can never read another user's personal or booking data.
begin;
\ir _helpers.psql
select plan(22);

select tests.create_user('alice', 'Alice Anderson');
select tests.create_user('bob', 'Bob Brown');
select tests.create_user('admin', 'Ada Admin', true, true);

select tests.login('alice');
select (tests.book('TENNIS', '2030-01-09', '18:00', 60)) ->> 'id' as b_alice \gset
reset role;
select tests.login('admin');
select lives_ok($$select public.admin_create_block(tests.fac('FOOTBALL'), null, '2030-01-09', '09:00', '2030-01-09', '10:00', 'PRIVATE_EVENT', 'CEO visit')$$,
  'admin creates a block with an internal note');
reset role;

-- ============ Bob, a normal user ============
select tests.login('bob');
select is((select count(*)::int from public.bookings), 0, 'bob sees zero bookings in the table (alice''s is invisible)');
select is((select count(*)::int from public.bookings where id = :'b_alice'), 0, 'even filtering by alice''s booking id returns nothing');
select is((select count(*)::int from public.bookings where user_id = tests.uid('alice')), 0, 'filtering by alice''s user id returns nothing');
select is((select count(*)::int from public.profiles), 1, 'bob sees only his own profile');
select is((select count(*)::int from public.profiles where email = 'alice@test.dcu'), 0, 'bob cannot look up alice by email');
select is((select count(*)::int from public.facility_blocks), 0, 'blocks table (with admin notes) hidden from users');
select is((select count(*)::int from public.admin_actions), 0, 'audit log hidden from users');
select throws_ok(format('select public.get_booking(%L)', :'b_alice'), 'P0001', 'BOOKING_NOT_FOUND', 'get_booking on alice''s booking: not found');
select is(jsonb_array_length(public.get_my_bookings('UPCOMING')), 0, 'get_my_bookings returns only bob''s (none)');
select is(tests.slot_status('TENNIS', '2030-01-09', '18:00'), 'BOOKED', 'bob only learns the slot is BOOKED');
select is((select array_agg(a.attname::text order by a.attnum)
           from pg_proc p, unnest(p.proargnames) with ordinality as a(attname, attnum)
           where p.oid = 'public.get_availability(uuid, date)'::regprocedure and a.attnum > 2),
  array['slot_start', 'slot_end', 'status', 'available_count', 'total_count', 'max_duration_minutes', 'block_reason'],
  'availability output has no user, booking or resource identity columns');
select throws_ok($$insert into public.bookings (booking_code, user_id, facility_id, activity_id, resource_id, start_at, end_at)
                   values ('DCU-AAAAAA', tests.uid('bob'), tests.fac('TENNIS'), tests.act('TENNIS'), tests.res('Tennis Court'),
                           '2030-01-09 13:00+07', '2030-01-09 13:30+07')$$,
  '42501', null, 'direct INSERT into bookings is denied');
select throws_ok(format($$update public.bookings set status = 'CANCELLED' where id = %L$$, :'b_alice'),
  '42501', null, 'direct UPDATE of bookings is denied');
select throws_ok($$insert into public.facility_blocks (facility_id, start_at, end_at, reason_type, created_by)
                   values (tests.fac('TENNIS'), '2030-01-09 13:00+07', '2030-01-09 14:00+07', 'OTHER', tests.uid('bob'))$$,
  '42501', null, 'direct INSERT into facility_blocks is denied');
select throws_ok($$update public.app_settings set max_active_bookings = 10$$, '42501', null, 'direct UPDATE of settings is denied');
reset role;

-- ============ Alice sees her own data ============
select tests.login('alice');
select is((select count(*)::int from public.bookings), 1, 'alice sees exactly her own booking');
select is((public.get_my_bookings('UPCOMING')) -> 0 ->> 'id', :'b_alice', 'get_my_bookings returns alice''s booking');
select ok(not ((public.get_my_bookings('UPCOMING')) -> 0 ? 'resource'), 'user-facing booking JSON does not expose the physical resource');
reset role;

-- ============ Anonymous (signed-out) ============
select tests.login_anon();
select throws_ok($$select count(*) from public.facilities$$, '42501', null, 'anon cannot read tables');
select throws_ok($$select public.get_availability(tests.fac('TENNIS'), '2030-01-09')$$, '42501', null, 'anon cannot call RPCs');
reset role;

-- ============ Admin ============
select tests.login('admin');
select is((select count(*)::int from public.bookings where user_id <> tests.uid('admin') and local_date >= '2030-01-01'), 1,
  'admin can read other users'' bookings');
reset role;

select * from finish();
rollback;
