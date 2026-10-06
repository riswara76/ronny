-- DCU Active — booking engine.
--
-- Concurrency model (approved in Phase 1, §E):
--   1. Row locks serialize every read-then-write decision. Lock order is ALWAYS:
--        profiles row (the booking user)  ->  resources rows of the facility (ORDER BY id)
--        ->  bookings rows (ORDER BY id)
--      Admin block creation takes only resource locks (same order); cancel / check-in
--      take only the booking row. No path takes these locks in reverse, so no deadlock.
--   2. Exclusion / unique constraints on bookings are the hard backstop: even a buggy
--      future write path cannot store a double booking.

-- -----------------------------------------------------------------------------
-- Small helpers
-- -----------------------------------------------------------------------------
create or replace function private.settings()
returns public.app_settings
language sql
stable
security definer
set search_path = ''
as $$
  select s from public.app_settings s where s.id;
$$;

-- A booking "holds" its resource while it is live. A CONFIRMED booking that missed
-- its check-in window is a no-show and releases the resource (decision D5), even
-- before the lifecycle job has rewritten its status.
create or replace function private.booking_is_live(
  p_status text, p_start_at timestamptz, p_end_at timestamptz, p_now timestamptz, p_late_minutes integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_status = 'CONFIRMED' and p_now <= p_start_at + make_interval(mins => p_late_minutes))
      or (p_status = 'CHECKED_IN' and p_now < p_end_at);
$$;

create or replace function private.effective_status(
  p_status text, p_start_at timestamptz, p_end_at timestamptz, p_now timestamptz, p_late_minutes integer
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status = 'CONFIRMED' and p_now > p_start_at + make_interval(mins => p_late_minutes) then 'NO_SHOW'
    when p_status = 'CHECKED_IN' and p_now >= p_end_at then 'COMPLETED'
    else p_status
  end;
$$;

-- Is the resource occupied by a live booking anywhere in [p_from, p_to)?
create or replace function private.resource_booked(p_resource_id uuid, p_from timestamptz, p_to timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    where b.resource_id = p_resource_id
      and b.status in ('CONFIRMED', 'CHECKED_IN')
      and b.time_range && tstzrange(p_from, p_to, '[)')
      and private.booking_is_live(b.status, b.start_at, b.end_at, private.now(),
                                  (private.settings()).checkin_late_minutes)
  );
$$;

-- Is the resource covered by an active admin block anywhere in [p_from, p_to)?
create or replace function private.resource_blocked(
  p_facility_id uuid, p_resource_id uuid, p_from timestamptz, p_to timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.facility_blocks k
    where k.facility_id = p_facility_id
      and (k.resource_id is null or k.resource_id = p_resource_id)
      and k.removed_at is null
      and k.time_range && tstzrange(p_from, p_to, '[)')
  );
$$;

create or replace function private.new_booking_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- No 0/O/1/I to avoid misreading at the front desk.
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(6);
  v_code text := 'DCU-';
begin
  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- JSON shape returned to the app for a booking. The physical resource is not exposed
-- to normal users (they never need to know which table they got).
create or replace function private.booking_json(p_booking public.bookings, p_include_admin_fields boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s   public.app_settings := private.settings();
  v_now timestamptz := private.now();
  v_f   public.facilities;
  v_a   public.activities;
  v_eff text;
  v_json jsonb;
  v_owner public.profiles;
  v_res  public.resources;
begin
  select * into v_f from public.facilities where id = p_booking.facility_id;
  select * into v_a from public.activities where id = p_booking.activity_id;
  v_eff := private.effective_status(p_booking.status, p_booking.start_at, p_booking.end_at, v_now, v_s.checkin_late_minutes);

  v_json := jsonb_build_object(
    'id',                  p_booking.id,
    'booking_code',        p_booking.booking_code,
    'facility',            jsonb_build_object('id', v_f.id, 'code', v_f.code, 'name', v_f.name, 'icon_key', v_f.icon_key),
    'activity',            jsonb_build_object('id', v_a.id, 'code', v_a.code, 'name', v_a.name),
    'date',                p_booking.local_date,
    'start_time',          to_char(p_booking.start_at at time zone 'Asia/Jakarta', 'HH24:MI'),
    'end_time',            to_char(p_booking.end_at at time zone 'Asia/Jakarta', 'HH24:MI'),
    'start_at',            p_booking.start_at,
    'end_at',              p_booking.end_at,
    'duration_minutes',    p_booking.duration_minutes,
    'status',              p_booking.status,
    'effective_status',    v_eff,
    'checked_in_at',       p_booking.checked_in_at,
    'cancelled_at',        p_booking.cancelled_at,
    'cancellation_type',   p_booking.cancellation_type,
    'cancellation_reason', p_booking.cancellation_reason,
    'checkin_opens_at',    p_booking.start_at - make_interval(mins => v_s.checkin_early_minutes),
    'checkin_closes_at',   p_booking.start_at + make_interval(mins => v_s.checkin_late_minutes),
    'can_cancel',          p_booking.status = 'CONFIRMED' and v_now < p_booking.start_at,
    'can_check_in',        p_booking.status = 'CONFIRMED'
                           and v_now >= p_booking.start_at - make_interval(mins => v_s.checkin_early_minutes)
                           and v_now <= p_booking.start_at + make_interval(mins => v_s.checkin_late_minutes),
    'created_at',          p_booking.created_at
  );

  if p_include_admin_fields then
    select * into v_owner from public.profiles where id = p_booking.user_id;
    select * into v_res from public.resources where id = p_booking.resource_id;
    v_json := v_json || jsonb_build_object(
      'user',     jsonb_build_object('id', v_owner.id, 'full_name', v_owner.full_name, 'email', v_owner.email),
      'resource', jsonb_build_object('id', v_res.id, 'name', v_res.name),
      'cancelled_by', p_booking.cancelled_by
    );
  end if;

  return v_json;
end;
$$;

-- -----------------------------------------------------------------------------
-- Lifecycle (no-show / completion)
-- -----------------------------------------------------------------------------
-- Rewrites stale CONFIRMED rows to NO_SHOW. Scoped variant used inside create_booking
-- so a no-show can never block a new booking through the exclusion constraints.
create or replace function private.sweep_no_shows(p_user_id uuid, p_facility_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_late  integer := (private.settings()).checkin_late_minutes;
  v_now   timestamptz := private.now();
  v_count integer;
begin
  with stale as (
    select b.id
    from public.bookings b
    where b.status = 'CONFIRMED'
      and b.start_at + make_interval(mins => v_late) < v_now
      and (b.user_id = p_user_id or b.facility_id = p_facility_id)
    order by b.id
    for update
  )
  update public.bookings b set status = 'NO_SHOW'
  from stale where b.id = stale.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Full sweep, run by pg_cron every minute.
create or replace function private.sweep_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_late      integer := (private.settings()).checkin_late_minutes;
  v_now       timestamptz := private.now();
  v_no_shows  integer;
  v_completed integer;
begin
  with stale as (
    select b.id from public.bookings b
    where b.status = 'CONFIRMED' and b.start_at + make_interval(mins => v_late) < v_now
    order by b.id
    for update skip locked      -- a row someone is changing right now is handled next run
  )
  update public.bookings b set status = 'NO_SHOW' from stale where b.id = stale.id;
  get diagnostics v_no_shows = row_count;

  with done as (
    select b.id from public.bookings b
    where b.status = 'CHECKED_IN' and b.end_at <= v_now
    order by b.id
    for update skip locked
  )
  update public.bookings b set status = 'COMPLETED' from done where b.id = done.id;
  get diagnostics v_completed = row_count;

  return jsonb_build_object('no_shows', v_no_shows, 'completed', v_completed);
end;
$$;

-- -----------------------------------------------------------------------------
-- Realtime: "availability changed" pings (no booking data is broadcast)
-- -----------------------------------------------------------------------------
create or replace function private.broadcast_availability(p_facility_id uuid, p_from date, p_to date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('facility_id', p_facility_id, 'from_date', p_from, 'to_date', p_to),
    'availability_changed',
    'availability',
    true
  );
exception when others then
  -- Realtime is a refresh hint only. Never fail a booking because a ping failed.
  null;
end;
$$;

create or replace function private.bookings_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform private.broadcast_availability(new.facility_id, new.local_date, new.local_date);
  end if;
  return null;
end;
$$;

create trigger bookings_notify after insert or update of status on public.bookings
  for each row execute function private.bookings_notify();

create or replace function private.facility_blocks_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.broadcast_availability(
    new.facility_id,
    (new.start_at at time zone 'Asia/Jakarta')::date,
    ((new.end_at - interval '1 second') at time zone 'Asia/Jakarta')::date
  );
  return null;
end;
$$;

create trigger facility_blocks_notify after insert or update on public.facility_blocks
  for each row execute function private.facility_blocks_notify();

-- -----------------------------------------------------------------------------
-- Availability core (shared by get_availability and get_facilities_overview)
-- -----------------------------------------------------------------------------
create or replace function private.availability(p_facility_id uuid, p_date date, p_user_id uuid)
returns table (
  slot_start           time,
  slot_end             time,
  status               text,
  available_count      integer,
  total_count          integer,
  max_duration_minutes integer,
  block_reason         text
)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select s.*, private.now() as now_ts,
           private.jakarta_ts(p_date, s.close_time) as close_at
    from public.app_settings s where s.id
  ),
  fac as (
    select f.* from public.facilities f where f.id = p_facility_id
  ),
  slots as (
    select g::time as t_start,
           private.jakarta_ts(p_date, g::time) as s_at
    from cfg,
         generate_series(p_date + cfg.open_time,
                         p_date + cfg.close_time - make_interval(mins => cfg.slot_minutes),
                         make_interval(mins => cfg.slot_minutes)) as g
  ),
  res as (
    select r.id from public.resources r where r.facility_id = p_facility_id and r.is_active
  ),
  per_slot as (
    select sl.t_start, sl.s_at,
           count(r.id)::integer as total,
           count(r.id) filter (
             where not private.resource_booked(r.id, sl.s_at, sl.s_at + interval '30 minutes')
               and not private.resource_blocked(p_facility_id, r.id, sl.s_at, sl.s_at + interval '30 minutes')
           )::integer as free,
           count(r.id) filter (
             where private.resource_blocked(p_facility_id, r.id, sl.s_at, sl.s_at + interval '30 minutes')
           )::integer as blocked
    from slots sl left join res r on true
    group by sl.t_start, sl.s_at
  )
  select
    ps.t_start,
    (ps.t_start + interval '30 minutes')::time,
    case
      when ps.s_at <= cfg.now_ts then 'PAST'
      when exists (
        select 1 from public.bookings b
        where b.user_id = p_user_id and b.facility_id = p_facility_id
          and b.time_range && tstzrange(ps.s_at, ps.s_at + interval '30 minutes', '[)')
          and private.booking_is_live(b.status, b.start_at, b.end_at, cfg.now_ts, cfg.checkin_late_minutes)
      ) then 'MINE'
      when ps.total = 0 then 'UNAVAILABLE'
      when ps.free > 0 then 'AVAILABLE'
      when ps.blocked = ps.total then 'BLOCKED'
      when ps.total = 1 then 'BOOKED'
      else 'FULL'
    end,
    case when ps.s_at <= cfg.now_ts then 0 else ps.free end,
    ps.total,
    case when ps.s_at <= cfg.now_ts then 0 else coalesce((
      select max(d)
      from fac, unnest(fac.allowed_durations) as d
      where ps.s_at + make_interval(mins => d) <= cfg.close_at
        and exists (
          select 1 from res r
          where not private.resource_booked(r.id, ps.s_at, ps.s_at + make_interval(mins => d))
            and not private.resource_blocked(p_facility_id, r.id, ps.s_at, ps.s_at + make_interval(mins => d))
        )
    ), 0) end,
    case when ps.total > 0 and ps.blocked = ps.total and ps.s_at > cfg.now_ts then (
      select min(k.reason_type) from public.facility_blocks k
      where k.facility_id = p_facility_id and k.removed_at is null
        and k.time_range && tstzrange(ps.s_at, ps.s_at + interval '30 minutes', '[)')
    ) end
  from per_slot ps, cfg
  order by ps.t_start;
$$;

-- -----------------------------------------------------------------------------
-- Public RPCs (user)
-- -----------------------------------------------------------------------------
create or replace function public.get_app_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_active_user();
  v_s     public.app_settings := private.settings();
  v_today date := private.jakarta_today();
begin
  return jsonb_build_object(
    'server_now',            private.now(),
    'timezone',              'Asia/Jakarta',
    'today',                 v_today,
    'last_bookable_date',    v_today + v_s.booking_horizon_days,
    'open_time',             to_char(v_s.open_time, 'HH24:MI'),
    'close_time',            to_char(v_s.close_time, 'HH24:MI'),
    'slot_minutes',          v_s.slot_minutes,
    'booking_horizon_days',  v_s.booking_horizon_days,
    'max_active_bookings',   v_s.max_active_bookings,
    'checkin_early_minutes', v_s.checkin_early_minutes,
    'checkin_late_minutes',  v_s.checkin_late_minutes,
    'is_admin',              private.is_admin()
  );
end;
$$;

create or replace function public.get_availability(p_facility_id uuid, p_date date)
returns table (
  slot_start           time,
  slot_end             time,
  status               text,
  available_count      integer,
  total_count          integer,
  max_duration_minutes integer,
  block_reason         text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_active_user();
  v_s     public.app_settings := private.settings();
  v_today date := private.jakarta_today();
begin
  if not exists (select 1 from public.facilities f where f.id = p_facility_id and f.is_active) then
    perform private.raise_error('FACILITY_NOT_FOUND');
  end if;
  if p_date is null or p_date < v_today or p_date > v_today + v_s.booking_horizon_days then
    perform private.raise_error('OUTSIDE_HORIZON', jsonb_build_object(
      'first_date', v_today, 'last_date', v_today + v_s.booking_horizon_days));
  end if;

  return query select * from private.availability(p_facility_id, p_date, v_uid);
end;
$$;

-- Home-screen cards: bookable slots left per facility for one date.
create or replace function public.get_facilities_overview(p_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_active_user();
  v_s     public.app_settings := private.settings();
  v_today date := private.jakarta_today();
  v_date  date := coalesce(p_date, private.jakarta_today());
begin
  if v_date < v_today or v_date > v_today + v_s.booking_horizon_days then
    perform private.raise_error('OUTSIDE_HORIZON', jsonb_build_object(
      'first_date', v_today, 'last_date', v_today + v_s.booking_horizon_days));
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'facility_id',     f.id,
      'code',            f.code,
      'name',            f.name,
      'icon_key',        f.icon_key,
      'allowed_durations', to_jsonb(f.allowed_durations),
      'activities',      (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name)
                                                     order by a.sort_order), '[]'::jsonb)
                          from public.activities a where a.facility_id = f.id and a.is_active),
      'available_slots', (select count(*) from private.availability(f.id, v_date, v_uid) av
                          where av.status = 'AVAILABLE'),
      'blocked_slots',   (select count(*) from private.availability(f.id, v_date, v_uid) av
                          where av.status = 'BLOCKED')
    ) order by f.sort_order)
    from public.facilities f where f.is_active
  ), '[]'::jsonb);
end;
$$;

create or replace function public.create_booking(
  p_facility_id uuid,
  p_activity_id uuid,
  p_date date,
  p_start_time time,
  p_duration_minutes integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := private.require_active_user();
  v_s           public.app_settings := private.settings();
  v_now         timestamptz := private.now();
  v_today       date := private.jakarta_today();
  v_fac         public.facilities;
  v_start       timestamptz;
  v_end         timestamptz;
  v_active      boolean;
  v_live_count  integer;
  v_resource_id uuid;
  v_total       integer;
  v_booking     public.bookings;
  v_constraint  text;
  v_attempt     integer := 0;
begin
  -- 1. Input validation (no locks yet) ---------------------------------------
  if p_facility_id is null or p_activity_id is null or p_date is null
     or p_start_time is null or p_duration_minutes is null then
    perform private.raise_error('INVALID_INPUT');
  end if;

  select * into v_fac from public.facilities f where f.id = p_facility_id and f.is_active;
  if not found then
    perform private.raise_error('FACILITY_NOT_FOUND');
  end if;

  if not exists (select 1 from public.activities a
                 where a.id = p_activity_id and a.facility_id = p_facility_id and a.is_active) then
    perform private.raise_error('INVALID_ACTIVITY');
  end if;

  if not (p_duration_minutes = any (v_fac.allowed_durations)) then
    perform private.raise_error('INVALID_DURATION', jsonb_build_object('allowed', v_fac.allowed_durations));
  end if;

  if extract(second from p_start_time) <> 0 or extract(minute from p_start_time) not in (0, 30) then
    perform private.raise_error('INVALID_START_TIME');
  end if;

  if p_date < v_today or p_date > v_today + v_s.booking_horizon_days then
    perform private.raise_error('OUTSIDE_HORIZON', jsonb_build_object(
      'first_date', v_today, 'last_date', v_today + v_s.booking_horizon_days));
  end if;

  v_start := private.jakarta_ts(p_date, p_start_time);
  v_end   := v_start + make_interval(mins => p_duration_minutes);

  if v_start < private.jakarta_ts(p_date, v_s.open_time) or v_end > private.jakarta_ts(p_date, v_s.close_time) then
    perform private.raise_error('OUTSIDE_HOURS', jsonb_build_object(
      'open_time', to_char(v_s.open_time, 'HH24:MI'), 'close_time', to_char(v_s.close_time, 'HH24:MI')));
  end if;

  if v_start <= v_now then
    perform private.raise_error('PAST_SLOT');
  end if;

  -- 2. Critical section --------------------------------------------------------
  -- 2a. Serialize this user's concurrent requests (and admin deactivation).
  select p.is_active into v_active from public.profiles p where p.id = v_uid for update;
  if not v_active then
    perform private.raise_error('ACCOUNT_DISABLED');
  end if;

  -- 2b. Serialize everyone booking this facility (and admin blocks on it).
  perform 1 from public.resources r where r.facility_id = p_facility_id order by r.id for update;

  -- 2c. Rewrite stale no-shows that could otherwise trip the constraints.
  perform private.sweep_no_shows(v_uid, p_facility_id);

  -- 3. Per-user fair-use rules -----------------------------------------------
  select count(*) into v_live_count
  from public.bookings b
  where b.user_id = v_uid
    and private.booking_is_live(b.status, b.start_at, b.end_at, v_now, v_s.checkin_late_minutes);
  if v_live_count >= v_s.max_active_bookings then
    perform private.raise_error('MAX_ACTIVE_BOOKINGS', jsonb_build_object('max', v_s.max_active_bookings));
  end if;

  if exists (select 1 from public.bookings b
             where b.user_id = v_uid and b.facility_id = p_facility_id and b.local_date = p_date
               and b.status not in ('CANCELLED', 'ADMIN_CANCELLED')) then
    perform private.raise_error('ALREADY_BOOKED_TODAY');
  end if;

  if exists (select 1 from public.bookings b
             where b.user_id = v_uid
               and b.time_range && tstzrange(v_start, v_end, '[)')
               and private.booking_is_live(b.status, b.start_at, b.end_at, v_now, v_s.checkin_late_minutes)) then
    perform private.raise_error('USER_OVERLAP');
  end if;

  -- 4. Allocate the first resource free for the WHOLE range ---------------------
  -- One range test covers 30/60/90 minutes: all consecutive slots on ONE resource.
  select r.id into v_resource_id
  from public.resources r
  where r.facility_id = p_facility_id and r.is_active
    and not private.resource_booked(r.id, v_start, v_end)
    and not private.resource_blocked(p_facility_id, r.id, v_start, v_end)
  order by r.sort_order, r.id
  limit 1;

  if v_resource_id is null then
    select count(*) into v_total from public.resources r where r.facility_id = p_facility_id and r.is_active;
    if v_total > 0 and not exists (
      select 1 from public.resources r
      where r.facility_id = p_facility_id and r.is_active
        and not private.resource_blocked(p_facility_id, r.id, v_start, v_end)
    ) then
      perform private.raise_error('FACILITY_BLOCKED');
    elsif v_total > 1 then
      perform private.raise_error('SLOT_FULL');
    else
      perform private.raise_error('SLOT_UNAVAILABLE');
    end if;
  end if;

  -- 5. Insert. Constraints re-check everything that matters at the storage level.
  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.bookings (booking_code, user_id, facility_id, activity_id, resource_id, start_at, end_at)
      values (private.new_booking_code(), v_uid, p_facility_id, p_activity_id, v_resource_id, v_start, v_end)
      returning * into v_booking;
      exit;
    exception
      when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'bookings_booking_code_key' and v_attempt < 5 then
          continue;   -- astronomically rare code collision: draw a new code
        elsif v_constraint = 'bookings_one_per_facility_day' then
          perform private.raise_error('ALREADY_BOOKED_TODAY');
        else
          raise;
        end if;
      when exclusion_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'bookings_no_user_overlap' then
          perform private.raise_error('USER_OVERLAP');
        else
          perform private.raise_error('SLOT_UNAVAILABLE');
        end if;
    end;
  end loop;

  return private.booking_json(v_booking);
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_b   public.bookings;
begin
  select * into v_b from public.bookings b
  where b.id = p_booking_id and b.user_id = v_uid
  for update;
  if not found then
    perform private.raise_error('BOOKING_NOT_FOUND');   -- also for other users' bookings: no existence leak
  end if;
  if v_b.status <> 'CONFIRMED' then
    perform private.raise_error('BOOKING_NOT_CANCELLABLE', jsonb_build_object('status', v_b.status));
  end if;
  if private.now() >= v_b.start_at then
    perform private.raise_error('CANNOT_CANCEL_STARTED');
  end if;

  update public.bookings
  set status = 'CANCELLED', cancelled_at = private.now(), cancelled_by = v_uid, cancellation_type = 'USER'
  where id = v_b.id
  returning * into v_b;

  return private.booking_json(v_b);
end;
$$;

create or replace function public.check_in(p_booking_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_active_user();
  v_s     public.app_settings := private.settings();
  v_now   timestamptz := private.now();
  v_b     public.bookings;
  v_opens timestamptz;
begin
  select * into v_b from public.bookings b
  where b.id = p_booking_id and b.user_id = v_uid
  for update;
  if not found then
    perform private.raise_error('BOOKING_NOT_FOUND');
  end if;
  if v_b.status = 'CHECKED_IN' then
    perform private.raise_error('ALREADY_CHECKED_IN');
  end if;
  if v_b.status <> 'CONFIRMED' then
    perform private.raise_error('CHECKIN_NOT_ALLOWED', jsonb_build_object('status', v_b.status));
  end if;

  v_opens := v_b.start_at - make_interval(mins => v_s.checkin_early_minutes);
  if v_now < v_opens then
    perform private.raise_error('CHECKIN_TOO_EARLY', jsonb_build_object(
      'opens_at', v_opens,
      'opens_at_local', to_char(v_opens at time zone 'Asia/Jakarta', 'HH24:MI')));
  end if;
  if v_now > v_b.start_at + make_interval(mins => v_s.checkin_late_minutes) then
    perform private.raise_error('CHECKIN_EXPIRED');
  end if;

  update public.bookings
  set status = 'CHECKED_IN', checked_in_at = v_now, check_in_method = 'BUTTON'
  where id = v_b.id
  returning * into v_b;

  return private.booking_json(v_b);
end;
$$;

-- p_scope: 'UPCOMING' (live bookings, soonest first) or 'HISTORY' (everything else, newest first).
create or replace function public.get_my_bookings(p_scope text default 'UPCOMING', p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_active_user();
  v_late integer := (private.settings()).checkin_late_minutes;
  v_now  timestamptz := private.now();
begin
  if p_scope not in ('UPCOMING', 'HISTORY') or p_limit not between 1 and 200 or p_offset < 0 then
    perform private.raise_error('INVALID_INPUT');
  end if;

  if p_scope = 'UPCOMING' then
    return coalesce((
      select jsonb_agg(private.booking_json(b) order by b.start_at)
      from public.bookings b
      where b.id in (select x.id from public.bookings x
                     where x.user_id = v_uid
                       and private.booking_is_live(x.status, x.start_at, x.end_at, v_now, v_late)
                     order by x.start_at limit p_limit offset p_offset)
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(private.booking_json(b) order by b.start_at desc)
    from public.bookings b
    where b.id in (select x.id from public.bookings x
                   where x.user_id = v_uid
                     and not private.booking_is_live(x.status, x.start_at, x.end_at, v_now, v_late)
                   order by x.start_at desc limit p_limit offset p_offset)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_booking(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_active_user();
  v_admin boolean := private.is_admin();
  v_b     public.bookings;
begin
  select * into v_b from public.bookings b
  where b.id = p_booking_id and (b.user_id = v_uid or v_admin);
  if not found then
    perform private.raise_error('BOOKING_NOT_FOUND');
  end if;
  return private.booking_json(v_b, v_admin);
end;
$$;
