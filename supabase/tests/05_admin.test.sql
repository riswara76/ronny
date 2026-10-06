-- Admin authorization, booking management, blocks (D6), users, settings, analytics.
begin;
\ir _helpers.psql
select plan(60);

-- Returns the DETAIL of the P0001 error raised by p_sql (as jsonb), or NULL.
create or replace function tests.error_detail(p_sql text) returns jsonb
language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return null;
exception when sqlstate 'P0001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return nullif(v_detail, '')::jsonb;
end $$;
grant execute on function tests.error_detail(text) to authenticated;

-- Isolate from any pre-existing data (rolled back with the test transaction).
update public.profiles set role = 'USER' where role = 'ADMIN';
select tests.create_user('admin', 'Ada Admin', true, true);
select tests.create_user('alice', 'Alice Anderson');
select tests.create_user('bob', 'Bob Brown');
select tests.create_user('carol', 'Carol Clark');

-- ============ Normal users cannot call any admin RPC ============
select tests.login('alice');
select throws_ok($$select public.admin_list_bookings()$$, 'P0001', 'NOT_AUTHORIZED', 'user: admin_list_bookings denied');
select throws_ok($$select public.admin_cancel_booking(gen_random_uuid())$$, 'P0001', 'NOT_AUTHORIZED', 'user: admin_cancel_booking denied');
select throws_ok($$select public.admin_create_block(tests.fac('TENNIS'), null, '2030-01-09', '09:00', '2030-01-09', '10:00', 'MAINTENANCE')$$,
  'P0001', 'NOT_AUTHORIZED', 'user: admin_create_block denied');
select throws_ok($$select public.admin_remove_block(gen_random_uuid())$$, 'P0001', 'NOT_AUTHORIZED', 'user: admin_remove_block denied');
select throws_ok($$select public.admin_list_blocks()$$, 'P0001', 'NOT_AUTHORIZED', 'user: admin_list_blocks denied');
select throws_ok($$select public.admin_list_users()$$, 'P0001', 'NOT_AUTHORIZED', 'user: admin_list_users denied');
select throws_ok(format('select public.admin_set_user_active(%L, false)', tests.uid('bob')), 'P0001', 'NOT_AUTHORIZED', 'user: admin_set_user_active denied');
select throws_ok(format($$select public.admin_set_user_role(%L, 'ADMIN')$$, tests.uid('alice')), 'P0001', 'NOT_AUTHORIZED', 'user: cannot promote self');
select throws_ok($$select public.admin_update_settings(p_max_active_bookings => 10)$$, 'P0001', 'NOT_AUTHORIZED', 'user: admin_update_settings denied');
select throws_ok($$select public.admin_dashboard()$$, 'P0001', 'NOT_AUTHORIZED', 'user: admin_dashboard denied');
select throws_ok($$select public.admin_stats('2030-01-01', '2030-01-31')$$, 'P0001', 'NOT_AUTHORIZED', 'user: admin_stats denied');
select is((public.get_app_config()) ->> 'is_admin', 'false', 'get_app_config reports is_admin=false for a user');

-- Bookings to manage.
select (tests.book('TENNIS', '2030-01-09', '10:00', 60)) ->> 'id' as b_alice \gset
reset role; select tests.login('bob');
select (tests.book('AIR_HOCKEY', '2030-01-09', '10:00')) ->> 'id' as b_bob \gset
reset role;

-- ============ Admin booking list shows owners ============
select tests.login('admin');
select is((public.get_app_config()) ->> 'is_admin', 'true', 'get_app_config reports is_admin=true for admin');
select is((public.admin_list_bookings(p_date_from => '2030-01-01')) ->> 'total', '2', 'admin sees all bookings (both users)');
select is((public.admin_list_bookings(p_date_from => '2030-01-01', p_search => 'anderson')) -> 'items' -> 0 -> 'user' ->> 'full_name', 'Alice Anderson',
  'admin can search by owner name and sees the owner');
select is((public.admin_list_bookings(p_date_from => '2030-01-01', p_facility_id => tests.fac('AIR_HOCKEY'))) -> 'items' -> 0 -> 'resource' ->> 'name', 'Air Hockey Table 1',
  'admin sees the allocated physical resource');
select is((public.admin_list_bookings(p_date_from => '2030-01-01', p_status => 'CANCELLED')) ->> 'total', '0', 'status filter works');
select is((public.get_booking(:'b_alice')) -> 'user' ->> 'email', 'alice@test.dcu', 'admin get_booking includes owner email');

-- ============ Block over an existing booking: conflict first, then confirm (D6) ============
select throws_ok($$select public.admin_create_block(tests.fac('TENNIS'), null, '2030-01-09', '09:00', '2030-01-09', '12:00', 'MAINTENANCE', 'Resurfacing')$$,
  'P0001', 'BLOCK_CONFLICTS', 'unconfirmed block over a booking is refused');
select is(tests.error_detail($$select public.admin_create_block(tests.fac('TENNIS'), null, '2030-01-09', '09:00', '2030-01-09', '12:00', 'MAINTENANCE')$$)
          -> 'conflicts' -> 0 ->> 'booking_code',
          (select booking_code from public.bookings where id = :'b_alice'), 'conflict list names the affected booking');
reset role;
select is((select count(*)::int from public.facility_blocks), 0, 'nothing was written by the unconfirmed attempt');
select is((select status from public.bookings where id = :'b_alice'), 'CONFIRMED', 'booking untouched by the unconfirmed attempt');

select tests.login('admin');
select (public.admin_create_block(tests.fac('TENNIS'), null, '2030-01-09', '09:00', '2030-01-09', '12:00', 'MAINTENANCE', 'Resurfacing', true))
  -> 'block' ->> 'id' as blk \gset
reset role;
select results_eq(format($$select status, cancellation_type, cancelled_by from public.bookings where id = %L$$, :'b_alice'),
  format($$values ('ADMIN_CANCELLED', 'SYSTEM_BLOCK', %L::uuid)$$, tests.uid('admin')),
  'confirmed block cancels the conflicting booking as SYSTEM_BLOCK');
select ok(exists (select 1 from public.admin_actions where action = 'BLOCK_CREATED' and target_id = :'blk'
                  and details -> 'cancelled_booking_ids' ? :'b_alice'), 'audit log records the block and the cancelled booking');

select tests.login('alice');
select is(tests.slot_status('TENNIS', '2030-01-09', '10:00'), 'BLOCKED', 'users see the blocked slot as BLOCKED');
select is((select block_reason from public.get_availability(tests.fac('TENNIS'), '2030-01-09') where slot_start = '10:00'), 'MAINTENANCE',
  'block reason category is shown (no admin identity)');
select throws_ok($$select tests.book('TENNIS', '2030-01-09', '11:30', 30)$$, 'P0001', 'FACILITY_BLOCKED', 'booking inside a block rejected');
select lives_ok($$select tests.book('TENNIS', '2030-01-09', '12:00', 30)$$, 'booking right after the block allowed (cancelled one did not use up the daily quota)');
reset role;

-- Block a single table of a 2-table facility.
select tests.login('admin');
select lives_ok($$select public.admin_create_block(tests.fac('AIR_HOCKEY'), tests.res('Air Hockey Table 2'), '2030-01-09', '10:00', '2030-01-09', '10:30', 'OTHER')$$,
  'block only Air Hockey Table 2 (no conflict: bob has Table 1)');
select throws_ok($$select public.admin_create_block(tests.fac('TENNIS'), tests.res('Air Hockey Table 1'), '2030-01-09', '13:00', '2030-01-09', '14:00', 'OTHER')$$,
  'P0001', 'INVALID_RESOURCE', 'resource must belong to the facility');
select throws_ok($$select public.admin_create_block(tests.fac('TENNIS'), null, '2030-01-09', '13:15', '2030-01-09', '14:00', 'OTHER')$$,
  'P0001', 'INVALID_BLOCK_TIME', 'block must be on 30-minute boundaries');
reset role;
select tests.login('carol');
select is(tests.slot_status('AIR_HOCKEY', '2030-01-09', '10:00'), 'FULL', 'Table 1 booked + Table 2 blocked -> FULL');
select throws_ok($$select tests.book('AIR_HOCKEY', '2030-01-09', '10:00')$$, 'P0001', 'SLOT_FULL', 'no table left for carol');
select is(tests.slot_status('AIR_HOCKEY', '2030-01-09', '10:30'), 'AVAILABLE', 'after the block both tables are free again');
reset role;

-- Remove the Tennis block.
select tests.login('admin');
select is((public.admin_list_blocks()) -> 0 ->> 'reason_type', 'MAINTENANCE', 'admin lists active blocks');
select ok((public.admin_remove_block(:'blk')) ->> 'removed_at' is not null, 'admin removes the future block');
select throws_ok(format('select public.admin_remove_block(%L)', :'blk'), 'P0001', 'BLOCK_NOT_FOUND', 'cannot remove twice');
reset role;
select tests.login('carol');
select is(tests.slot_status('TENNIS', '2030-01-09', '10:00'), 'AVAILABLE', 'Tennis 10:00 bookable again after removal');
reset role;

-- A block that has already ended cannot be removed.
select tests.login('admin');
select (public.admin_create_block(tests.fac('FOOTBALL'), null, '2030-01-07', '09:00', '2030-01-07', '09:30', 'DCU_PROGRAM')) -> 'block' ->> 'id' as old_blk \gset
reset role;
select tests.set_now('2030-01-07 09:31:00+07');
select tests.login('admin');
select throws_ok(format('select public.admin_remove_block(%L)', :'old_blk'), 'P0001', 'BLOCK_ALREADY_ENDED', 'past block stays as history');
reset role;
select tests.set_now('2030-01-07 09:05:00+07');

-- ============ Admin cancels a booking ============
select tests.login('admin');
select is((public.admin_cancel_booking(:'b_bob', 'Equipment broken')) ->> 'status', 'ADMIN_CANCELLED', 'admin cancels bob''s booking');
select throws_ok(format('select public.admin_cancel_booking(%L)', :'b_bob'), 'P0001', 'BOOKING_NOT_CANCELLABLE', 'cannot cancel twice');
reset role;
select results_eq(format($$select cancellation_type, cancellation_reason from public.bookings where id = %L$$, :'b_bob'),
  $$values ('ADMIN', 'Equipment broken')$$, 'admin cancellation type and reason stored');

-- ============ Deactivation ============
select tests.login('admin');
select is((public.admin_set_user_active(tests.uid('alice'), false, 'Left DCU')) ->> 'cancelled_bookings', '1',
  'deactivation cancels the user''s future booking');
reset role;
select is((select string_agg(to_char(start_at at time zone 'Asia/Jakarta', 'HH24:MI'), ',') from public.bookings
           where user_id = tests.uid('alice') and cancellation_type = 'SYSTEM_DEACTIVATION'), '12:00',
  'exactly the future 12:00 booking was cancelled as SYSTEM_DEACTIVATION');
select tests.login('alice');
select throws_ok($$select tests.book('FOOTBALL', '2030-01-10', '10:00')$$, 'P0001', 'ACCOUNT_DISABLED', 'deactivated user cannot book');
reset role;
select tests.login('admin');
select lives_ok(format('select public.admin_set_user_active(%L, true)', tests.uid('alice')), 'reactivate');
reset role;
select tests.login('alice');
select lives_ok($$select tests.book('FOOTBALL', '2030-01-10', '10:00')$$, 'reactivated user can book again');
reset role;

-- ============ Roles and the last-admin guard ============
select tests.login('admin');
select throws_ok(format('select public.admin_set_user_active(%L, false)', tests.uid('admin')), 'P0001', 'LAST_ADMIN', 'last admin cannot deactivate self');
select throws_ok(format($$select public.admin_set_user_role(%L, 'USER')$$, tests.uid('admin')), 'P0001', 'LAST_ADMIN', 'last admin cannot demote self');
select is((public.admin_set_user_role(tests.uid('bob'), 'ADMIN')) ->> 'role', 'ADMIN', 'admin promotes bob');
reset role;
select tests.login('bob');
select lives_ok($$select public.admin_dashboard()$$, 'promotion takes effect immediately (no token refresh needed)');
select is((public.admin_set_user_role(tests.uid('admin'), 'USER')) ->> 'role', 'USER', 'bob demotes the original admin');
reset role;
select tests.login('admin');
select throws_ok($$select public.admin_dashboard()$$, 'P0001', 'NOT_AUTHORIZED', 'demotion takes effect immediately with the same JWT');
reset role;

-- ============ Settings ============
select tests.login('bob');
select is((public.admin_update_settings(p_max_active_bookings => 3)) ->> 'max_active_bookings', '3', 'admin changes max active bookings');
select throws_ok($$select public.admin_update_settings(p_booking_horizon_days => 99)$$, 'P0001', 'INVALID_SETTINGS', 'out-of-range setting rejected');

-- ============ Dashboard, analytics, users ============
select ok((public.admin_dashboard('2030-01-09')) ?& array['bookings_on_date', 'upcoming_bookings', 'no_shows_last_7_days', 'active_users', 'utilization'],
  'dashboard returns the agreed summary fields');
select is((public.admin_stats('2030-01-07', '2030-01-13')) -> 'totals' ->> 'cancelled_by_admin', '3',
  'stats count admin cancellations (block, manual, deactivation)');
select ok((public.admin_list_users('alice')) -> 'items' -> 0 ?& array['email_verified', 'no_shows', 'upcoming_bookings'],
  'user list includes verification and no-show info');
reset role;

-- ============ Audit log is append-only ============
select throws_ok($$update public.admin_actions set action = 'X'$$, 'P0001', 'AUDIT_LOG_IMMUTABLE', 'audit rows cannot be edited');
select throws_ok($$delete from public.admin_actions$$, 'P0001', 'AUDIT_LOG_IMMUTABLE', 'audit rows cannot be deleted');

select * from finish();
rollback;
