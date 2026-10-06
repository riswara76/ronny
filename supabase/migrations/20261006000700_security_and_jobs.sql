-- DCU Active — Row Level Security, privileges, scheduled job, Realtime authorization.
--
-- Model: clients READ through RLS-protected tables/RPCs and WRITE only through
-- SECURITY DEFINER RPCs. No client role has INSERT/UPDATE/DELETE on bookings,
-- facility_blocks, app_settings or admin_actions.

-- -----------------------------------------------------------------------------
-- 1. Start from zero: Supabase grants broad defaults to anon/authenticated.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Future objects created in public must be granted explicitly too.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.facilities      enable row level security;
alter table public.activities      enable row level security;
alter table public.resources       enable row level security;
alter table public.app_settings    enable row level security;
alter table public.bookings        enable row level security;
alter table public.facility_blocks enable row level security;
alter table public.admin_actions   enable row level security;

-- profiles: own row; admins see everyone. Users may edit only their name.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- reference data: everyone signed in sees active rows; admins see all rows.
create policy facilities_select on public.facilities
  for select to authenticated using (is_active or (select private.is_admin()));
create policy activities_select on public.activities
  for select to authenticated using (is_active or (select private.is_admin()));
create policy resources_select on public.resources
  for select to authenticated using (is_active or (select private.is_admin()));
create policy app_settings_select on public.app_settings
  for select to authenticated using (true);

-- bookings: ONLY your own rows; admins all. Availability for everyone comes from
-- get_availability(), which returns aggregates and never another user's identity.
create policy bookings_select on public.bookings
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- blocks and audit log: admins only (users see blocks as BLOCKED slots via RPC).
create policy facility_blocks_select_admin on public.facility_blocks
  for select to authenticated using ((select private.is_admin()));
create policy admin_actions_select_admin on public.admin_actions
  for select to authenticated using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- 3. Table privileges (RLS above decides WHICH rows)
-- -----------------------------------------------------------------------------
grant select on public.profiles, public.facilities, public.activities, public.resources,
                public.app_settings, public.bookings, public.facility_blocks, public.admin_actions
  to authenticated;
grant update (full_name) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Function privileges
-- -----------------------------------------------------------------------------
-- Used inside RLS policies, so callers need EXECUTE.
grant execute on function private.is_admin() to authenticated;

grant execute on function
  public.get_app_config(),
  public.get_availability(uuid, date),
  public.get_facilities_overview(date),
  public.create_booking(uuid, uuid, date, time, integer),
  public.cancel_booking(uuid),
  public.check_in(uuid),
  public.get_my_bookings(text, integer, integer),
  public.get_booking(uuid),
  public.admin_list_bookings(date, date, uuid, text, text, integer, integer),
  public.admin_cancel_booking(uuid, text),
  public.admin_create_block(uuid, uuid, date, time, date, time, text, text, boolean),
  public.admin_remove_block(uuid),
  public.admin_list_blocks(boolean),
  public.admin_list_users(text, integer, integer),
  public.admin_set_user_active(uuid, boolean, text),
  public.admin_set_user_role(uuid, text),
  public.admin_update_settings(integer, integer, integer, integer),
  public.admin_dashboard(date),
  public.admin_stats(date, date)
to authenticated;

-- The Auth service inserts into auth.users and fires the profile trigger.
grant usage on schema private to supabase_auth_admin;
grant execute on function
  private.handle_new_auth_user(),
  private.handle_auth_user_email_change(),
  private.assert_registration_allowed(text, jsonb)
to supabase_auth_admin;

-- -----------------------------------------------------------------------------
-- 5. Lifecycle job: NO_SHOW / COMPLETED every minute.
-- Correctness never depends on it (RPCs evaluate effective status themselves);
-- it keeps stored statuses tidy for reporting.
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dcu-booking-lifecycle') then
    perform cron.unschedule('dcu-booking-lifecycle');
  end if;
  perform cron.schedule('dcu-booking-lifecycle', '* * * * *', 'select private.sweep_lifecycle()');
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Realtime: signed-in users may listen to the private "availability" topic.
-- Payload is {facility_id, from_date, to_date} only.
-- -----------------------------------------------------------------------------
create policy availability_broadcast_read on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'availability' and realtime.messages.extension = 'broadcast');
