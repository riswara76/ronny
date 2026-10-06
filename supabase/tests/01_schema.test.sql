-- Schema, reference data, hardening.
begin;
\ir _helpers.psql
select plan(27);

-- Reference data -------------------------------------------------------------
select is((select count(*)::int from public.facilities), 6, '6 facilities seeded');
select is((select count(*)::int from public.activities), 7, '7 activities seeded');
select is((select count(*)::int from public.resources), 8, '8 physical resources seeded');
select is((select count(*)::int from public.resources where facility_id = tests.fac('AIR_HOCKEY')), 2, 'Air Hockey has 2 tables');
select is((select count(*)::int from public.resources where facility_id = tests.fac('FOOSBALL')), 2, 'Foosball has 2 tables');
select is((select count(*)::int from public.resources where facility_id = tests.fac('BASKETBALL_FUTSAL')), 1,
  'Basketball/Futsal share exactly 1 court');
select set_eq($$select code from public.activities where facility_id = tests.fac('BASKETBALL_FUTSAL')$$,
  array['BASKETBALL', 'FUTSAL'], 'Basketball and Futsal are activities of the same facility');
select is((select allowed_durations from public.facilities where code = 'TENNIS'), array[30, 60, 90], 'Tennis: 30/60/90');
select is((select allowed_durations from public.facilities where code = 'BASKETBALL_FUTSAL'), array[30, 60, 90], 'Basketball/Futsal: 30/60/90');
select is((select array_agg(distinct d) from public.facilities f, unnest(f.allowed_durations) d
           where f.code in ('TABLE_TENNIS', 'FOOTBALL', 'AIR_HOCKEY', 'FOOSBALL')), array[30], 'Standard facilities: 30 only');
select results_eq($$select open_time, close_time, slot_minutes, booking_horizon_days, max_active_bookings,
                           checkin_early_minutes, checkin_late_minutes from public.app_settings$$,
  $$values ('06:00'::time, '21:00'::time, 30, 7, 2, 15, 15)$$, 'Default settings match the approved rules');

-- RLS enabled on every app table ----------------------------------------------
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0,
  'RLS is enabled on every public table');

-- Constraints that carry the core guarantees -----------------------------------
select ok(exists (select 1 from pg_constraint where conname = 'bookings_no_resource_overlap' and contype = 'x'),
  'exclusion constraint: no resource overlap');
select ok(exists (select 1 from pg_constraint where conname = 'bookings_no_user_overlap' and contype = 'x'),
  'exclusion constraint: no user overlap');
select ok(exists (select 1 from pg_indexes where indexname = 'bookings_one_per_facility_day'),
  'unique index: once per facility per day');

-- Privileges -------------------------------------------------------------------
select is((select count(*)::int from information_schema.role_table_grants
           where table_schema = 'public' and grantee = 'anon'), 0, 'anon has no table privileges');
select is((select count(*)::int from information_schema.role_table_grants
           where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'DELETE', 'TRUNCATE')), 0,
  'authenticated cannot INSERT/DELETE/TRUNCATE any table');
select is((select array_agg(column_name::text) from information_schema.column_privileges
           where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  array['full_name'], 'the only column authenticated may UPDATE is profiles.full_name');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), 0,
  'anon cannot execute any public function');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and not p.prosecdef), 0,
  'every public RPC is SECURITY DEFINER');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and p.prosecdef
             and not coalesce(p.proconfig @> array['search_path=""'], false)), 0,
  'every SECURITY DEFINER function pins search_path to empty');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')), 1,
  'authenticated can execute exactly one private function (is_admin, used by RLS)');

-- Jobs & realtime ---------------------------------------------------------------
select ok(exists (select 1 from cron.job where jobname = 'dcu-booking-lifecycle' and schedule = '* * * * *'),
  'lifecycle job scheduled every minute');
select ok(exists (select 1 from pg_policies where schemaname = 'realtime' and policyname = 'availability_broadcast_read'),
  'realtime availability channel policy exists');

-- Clock override only for postgres sessions ------------------------------------
select is(private.now(), '2030-01-07 09:05:00+07'::timestamptz, 'test clock override works for postgres session');
select is(private.jakarta_today(), '2030-01-07'::date, 'jakarta_today follows the clock');
select is(private.jakarta_ts('2030-01-07', '06:00'), '2030-01-06 23:00:00+00'::timestamptz,
  '06:00 WIB is 23:00 UTC the previous day');

select * from finish();
rollback;
