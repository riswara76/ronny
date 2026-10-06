-- DCU Active — foundation: extensions, private schema, core helpers.
--
-- Conventions used by every later migration:
--   * Business timezone is the constant 'Asia/Jakarta' (fixed UTC+7, no DST).
--   * Every RPC is SECURITY DEFINER with search_path = '' and fully qualified names.
--   * Errors raised to clients use SQLSTATE P0001 and a stable code as the message
--     (see private.raise_error). The Flutter app maps codes to user-facing text.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Helpers that must never be reachable through the Data API live here.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- RLS policies call private.is_admin(), so signed-in users need USAGE on the schema.
-- They receive EXECUTE only on the handful of functions granted explicitly later.
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Error helper
-- -----------------------------------------------------------------------------
-- Declared STABLE (it never writes) so read-only RPCs can call it.
create or replace function private.raise_error(p_code text, p_detail jsonb default null)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_detail is null then
    raise exception using errcode = 'P0001', message = p_code;
  else
    raise exception using errcode = 'P0001', message = p_code, detail = p_detail::text;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Clock
-- -----------------------------------------------------------------------------
-- All business rules read the time from here, never from the client.
--
-- Deterministic tests need a controllable clock. The override is honoured ONLY when
-- the database session was opened by the `postgres` superuser (pgTAP via
-- `supabase test db`, or an operator in psql). Requests from the app arrive through
-- PostgREST, whose session user is `authenticator`, so an app user can never move
-- the clock — and they cannot run SET statements through the Data API anyway.
create or replace function private.now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when session_user = 'postgres'
         and nullif(current_setting('dcu.test_now', true), '') is not null
      then current_setting('dcu.test_now', true)::timestamptz
    else pg_catalog.now()
  end;
$$;

create or replace function private.jakarta_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (private.now() at time zone 'Asia/Jakarta')::date;
$$;

-- Converts a Jakarta calendar date + wall-clock time into an absolute timestamp.
create or replace function private.jakarta_ts(p_date date, p_time time)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p_date + p_time) at time zone 'Asia/Jakarta';
$$;

-- Shared trigger: maintain updated_at.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
