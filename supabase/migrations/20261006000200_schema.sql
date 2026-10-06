-- DCU Active — tables, constraints and indexes.

-- -----------------------------------------------------------------------------
-- profiles: one row per auth user (created by trigger, see auth migration)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text not null check (char_length(btrim(full_name)) between 2 and 100),
  email          text not null,
  role           text not null default 'USER' check (role in ('USER', 'ADMIN')),
  is_active      boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_deactivation_consistent
    check (is_active = (deactivated_at is null))
);
comment on table public.profiles is
  'Application user record. Users may change only full_name; role and is_active change through admin RPCs.';

create index profiles_email_lower_idx on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role) where role = 'ADMIN';

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- facilities / activities / resources
-- -----------------------------------------------------------------------------
create table public.facilities (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code ~ '^[A-Z][A-Z_]*$'),
  name              text not null check (char_length(name) between 2 and 60),
  icon_key          text not null,
  allowed_durations integer[] not null
    check (cardinality(allowed_durations) > 0 and allowed_durations <@ array[30, 60, 90]),
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.facilities is 'What users choose to book (e.g. Tennis, Air Hockey).';

create trigger facilities_touch before update on public.facilities
  for each row execute function private.touch_updated_at();

create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id),
  code        text not null check (code ~ '^[A-Z][A-Z_]*$'),
  name        text not null check (char_length(name) between 2 and 60),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (facility_id, code),
  unique (facility_id, id)          -- target of the composite FK from bookings
);
comment on table public.activities is
  'Activity label within a facility (Basketball and Futsal share one facility and one court).';

create trigger activities_touch before update on public.activities
  for each row execute function private.touch_updated_at();

create table public.resources (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id),
  name        text not null check (char_length(name) between 2 and 60),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (facility_id, name),
  unique (facility_id, id)          -- target of the composite FKs from bookings and blocks
);
comment on table public.resources is
  'Physical thing that gets allocated (a court, a table). Users never pick one; the booking engine does.';

create trigger resources_touch before update on public.resources
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- app_settings: exactly one row
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id                    boolean primary key default true check (id),
  -- Migration-only values: changing them changes the meaning of existing bookings.
  open_time             time not null default '06:00',
  close_time            time not null default '21:00',
  slot_minutes          integer not null default 30 check (slot_minutes = 30),
  -- Admin-editable values: they only affect future decisions.
  booking_horizon_days  integer not null default 7 check (booking_horizon_days between 0 and 30),
  max_active_bookings   integer not null default 2 check (max_active_bookings between 1 and 10),
  checkin_early_minutes integer not null default 15 check (checkin_early_minutes between 0 and 60),
  checkin_late_minutes  integer not null default 15 check (checkin_late_minutes between 0 and 30),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles (id),
  constraint app_settings_hours_valid check (
    open_time < close_time
    and extract(second from open_time) = 0 and extract(minute from open_time) in (0, 30)
    and extract(second from close_time) = 0 and extract(minute from close_time) in (0, 30)
  )
);
comment on table public.app_settings is 'Single-row business configuration.';

create trigger app_settings_touch before update on public.app_settings
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- bookings
-- -----------------------------------------------------------------------------
create table public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  booking_code        text not null unique check (booking_code ~ '^DCU-[A-Z0-9]{6}$'),
  user_id             uuid not null references public.profiles (id) on delete restrict,
  facility_id         uuid not null references public.facilities (id),
  activity_id         uuid not null,
  resource_id         uuid not null,
  start_at            timestamptz not null,
  end_at              timestamptz not null,
  time_range          tstzrange generated always as (tstzrange(start_at, end_at, '[)')) stored,
  local_date          date generated always as ((start_at at time zone 'Asia/Jakarta')::date) stored,
  duration_minutes    integer generated always as ((extract(epoch from (end_at - start_at)) / 60)::integer) stored,
  status              text not null default 'CONFIRMED'
    check (status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'ADMIN_CANCELLED')),
  checked_in_at       timestamptz,
  check_in_method     text check (check_in_method in ('BUTTON', 'QR', 'ADMIN')),
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles (id),
  cancellation_type   text check (cancellation_type in ('USER', 'ADMIN', 'SYSTEM_BLOCK', 'SYSTEM_DEACTIVATION')),
  cancellation_reason text check (char_length(cancellation_reason) <= 500),
  status_changed_at   timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint bookings_activity_matches_facility
    foreign key (facility_id, activity_id) references public.activities (facility_id, id),
  constraint bookings_resource_matches_facility
    foreign key (facility_id, resource_id) references public.resources (facility_id, id),

  constraint bookings_range_valid check (end_at > start_at),
  constraint bookings_duration_valid
    check (end_at - start_at in (interval '30 minutes', interval '60 minutes', interval '90 minutes')),
  -- Jakarta is a whole-hour offset from UTC, so :00/:30 alignment in UTC == in Jakarta.
  constraint bookings_start_aligned check (extract(epoch from start_at)::bigint % 1800 = 0),

  constraint bookings_cancellation_consistent check (
    (status in ('CANCELLED', 'ADMIN_CANCELLED')) = (cancelled_at is not null)
    and (cancelled_at is null) = (cancellation_type is null)
    and (status <> 'CANCELLED' or cancellation_type = 'USER')
    and (status <> 'ADMIN_CANCELLED' or cancellation_type in ('ADMIN', 'SYSTEM_BLOCK', 'SYSTEM_DEACTIVATION'))
  ),
  constraint bookings_checkin_consistent check (
    (status not in ('CHECKED_IN', 'COMPLETED') or (checked_in_at is not null and check_in_method is not null))
    and (status not in ('CONFIRMED', 'NO_SHOW', 'CANCELLED') or checked_in_at is null)
  ),

  -- THE double-booking guarantee: two live bookings can never overlap on one resource.
  constraint bookings_no_resource_overlap
    exclude using gist (resource_id with =, time_range with &&)
    where (status in ('CONFIRMED', 'CHECKED_IN')),
  -- A user can never hold two live bookings that overlap in time (any facility).
  constraint bookings_no_user_overlap
    exclude using gist (user_id with =, time_range with &&)
    where (status in ('CONFIRMED', 'CHECKED_IN'))
);
comment on table public.bookings is
  'User bookings. Rows are never deleted; cancellation and no-show are status changes.';

-- Once per facility per Jakarta day. Cancelled bookings do not count; no-shows do.
create unique index bookings_one_per_facility_day
  on public.bookings (user_id, facility_id, local_date)
  where status not in ('CANCELLED', 'ADMIN_CANCELLED');

create index bookings_user_start_idx on public.bookings (user_id, start_at desc);
create index bookings_start_idx on public.bookings (start_at);
create index bookings_facility_start_idx on public.bookings (facility_id, start_at);
create index bookings_lifecycle_idx on public.bookings (status, start_at)
  where status in ('CONFIRMED', 'CHECKED_IN');

-- Defense in depth: booking identity/time never changes, and only legal status
-- transitions are possible, whoever performs the UPDATE.
create or replace function private.bookings_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.booking_code <> old.booking_code or new.user_id <> old.user_id
     or new.facility_id <> old.facility_id or new.activity_id <> old.activity_id
     or new.resource_id <> old.resource_id or new.start_at <> old.start_at
     or new.end_at <> old.end_at or new.created_at <> old.created_at then
    raise exception using errcode = 'P0001', message = 'BOOKING_IMMUTABLE';
  end if;

  if new.status <> old.status then
    if not (
         (old.status = 'CONFIRMED'  and new.status in ('CHECKED_IN', 'CANCELLED', 'ADMIN_CANCELLED', 'NO_SHOW'))
      or (old.status = 'CHECKED_IN' and new.status in ('COMPLETED', 'ADMIN_CANCELLED'))
    ) then
      raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION',
        detail = format('%s -> %s', old.status, new.status);
    end if;
    new.status_changed_at := pg_catalog.now();
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger bookings_guard before update on public.bookings
  for each row execute function private.bookings_guard_update();

create or replace function private.bookings_forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'BOOKING_DELETE_FORBIDDEN';
end;
$$;

create trigger bookings_no_delete before delete on public.bookings
  for each row execute function private.bookings_forbid_delete();

-- -----------------------------------------------------------------------------
-- facility_blocks: maintenance / events. resource_id NULL = every resource.
-- -----------------------------------------------------------------------------
create table public.facility_blocks (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id),
  resource_id uuid,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  time_range  tstzrange generated always as (tstzrange(start_at, end_at, '[)')) stored,
  reason_type text not null check (reason_type in ('MAINTENANCE', 'DCU_PROGRAM', 'PRIVATE_EVENT', 'OTHER')),
  note        text check (char_length(note) <= 500),
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  removed_at  timestamptz,
  removed_by  uuid references public.profiles (id),

  constraint facility_blocks_resource_matches_facility
    foreign key (facility_id, resource_id) references public.resources (facility_id, id),
  constraint facility_blocks_range_valid check (end_at > start_at),
  constraint facility_blocks_aligned check (
    extract(epoch from start_at)::bigint % 1800 = 0 and extract(epoch from end_at)::bigint % 1800 = 0
  ),
  constraint facility_blocks_removal_consistent check ((removed_at is null) = (removed_by is null))
);
comment on table public.facility_blocks is
  'Admin-created unavailability. Soft-removed (removed_at) to keep history.';

create index facility_blocks_active_idx on public.facility_blocks
  using gist (facility_id, time_range) where removed_at is null;

-- -----------------------------------------------------------------------------
-- admin_actions: append-only audit log
-- -----------------------------------------------------------------------------
create table public.admin_actions (
  id          bigint generated always as identity primary key,
  admin_id    uuid references public.profiles (id),   -- NULL = system (e.g. scheduled job)
  action      text not null,
  target_type text not null,
  target_id   uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.admin_actions is 'Append-only audit trail of administrative actions.';

create index admin_actions_created_idx on public.admin_actions (created_at desc);
create index admin_actions_target_idx on public.admin_actions (target_type, target_id);

create or replace function private.admin_actions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'AUDIT_LOG_IMMUTABLE';
end;
$$;

create trigger admin_actions_immutable before update or delete on public.admin_actions
  for each row execute function private.admin_actions_append_only();
