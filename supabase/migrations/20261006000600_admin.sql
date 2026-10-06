-- DCU Active — administrator RPCs. Every function starts with private.require_admin(),
-- which re-reads the caller's role from the database (never from the JWT).

-- -----------------------------------------------------------------------------
-- Bookings
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_bookings(
  p_date_from   date default null,
  p_date_to     date default null,
  p_facility_id uuid default null,
  p_status      text default null,      -- matches effective_status (e.g. NO_SHOW before the job runs)
  p_search      text default null,      -- name, email or booking code
  p_limit       integer default 50,
  p_offset      integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin  uuid := private.require_admin();
  v_late   integer := (private.settings()).checkin_late_minutes;
  v_now    timestamptz := private.now();
  v_search text := nullif(btrim(p_search), '');
  v_total  integer;
  v_items  jsonb;
begin
  if p_limit not between 1 and 200 or p_offset < 0
     or (p_status is not null and p_status not in
         ('CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'ADMIN_CANCELLED')) then
    perform private.raise_error('INVALID_INPUT');
  end if;

  with hits as (
    select b.id, b.start_at
    from public.bookings b
    join public.profiles p on p.id = b.user_id
    where (p_date_from is null or b.local_date >= p_date_from)
      and (p_date_to is null or b.local_date <= p_date_to)
      and (p_facility_id is null or b.facility_id = p_facility_id)
      and (p_status is null or private.effective_status(b.status, b.start_at, b.end_at, v_now, v_late) = p_status)
      and (v_search is null
           or p.full_name ilike '%' || v_search || '%'
           or p.email ilike '%' || v_search || '%'
           or b.booking_code ilike '%' || v_search || '%')
  )
  select (select count(*) from hits),
         (select coalesce(jsonb_agg(private.booking_json(b, true) order by b.start_at desc), '[]'::jsonb)
          from public.bookings b
          where b.id in (select h.id from hits h order by h.start_at desc limit p_limit offset p_offset))
  into v_total, v_items;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

create or replace function public.admin_cancel_booking(p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_s     public.app_settings := private.settings();
  v_now   timestamptz := private.now();
  v_b     public.bookings;
begin
  if char_length(p_reason) > 500 then
    perform private.raise_error('INVALID_INPUT');
  end if;

  select * into v_b from public.bookings b where b.id = p_booking_id for update;
  if not found then
    perform private.raise_error('BOOKING_NOT_FOUND');
  end if;
  if not private.booking_is_live(v_b.status, v_b.start_at, v_b.end_at, v_now, v_s.checkin_late_minutes) then
    perform private.raise_error('BOOKING_NOT_CANCELLABLE', jsonb_build_object(
      'status', private.effective_status(v_b.status, v_b.start_at, v_b.end_at, v_now, v_s.checkin_late_minutes)));
  end if;

  update public.bookings
  set status = 'ADMIN_CANCELLED', cancelled_at = v_now, cancelled_by = v_admin,
      cancellation_type = 'ADMIN', cancellation_reason = nullif(btrim(p_reason), '')
  where id = v_b.id
  returning * into v_b;

  perform private.log_admin_action(v_admin, 'BOOKING_CANCELLED', 'booking', v_b.id,
    jsonb_build_object('booking_code', v_b.booking_code, 'user_id', v_b.user_id, 'reason', v_b.cancellation_reason));

  return private.booking_json(v_b, true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Facility blocks
-- -----------------------------------------------------------------------------
-- Two-step conflict flow (decision D6):
--   call 1: p_cancel_conflicts = false -> if live bookings overlap, raises BLOCK_CONFLICTS
--           with the list in the error detail; nothing is written.
--   call 2: p_cancel_conflicts = true  -> conflicting bookings become ADMIN_CANCELLED /
--           SYSTEM_BLOCK, the block is created, everything is audited, in one transaction.
create or replace function public.admin_create_block(
  p_facility_id      uuid,
  p_resource_id      uuid,          -- NULL = every resource of the facility
  p_start_date       date,
  p_start_time       time,
  p_end_date         date,
  p_end_time         time,
  p_reason_type      text,
  p_note             text default null,
  p_cancel_conflicts boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin     uuid := private.require_admin();
  v_s         public.app_settings := private.settings();
  v_now       timestamptz := private.now();
  v_start     timestamptz;
  v_end       timestamptz;
  v_conflicts jsonb;
  v_cancelled jsonb := '[]'::jsonb;
  v_block     public.facility_blocks;
  v_b         public.bookings;
begin
  if p_facility_id is null or p_start_date is null or p_start_time is null
     or p_end_date is null or p_end_time is null or p_reason_type is null
     or char_length(p_note) > 500 then
    perform private.raise_error('INVALID_INPUT');
  end if;
  if p_reason_type not in ('MAINTENANCE', 'DCU_PROGRAM', 'PRIVATE_EVENT', 'OTHER') then
    perform private.raise_error('INVALID_REASON');
  end if;
  if not exists (select 1 from public.facilities f where f.id = p_facility_id) then
    perform private.raise_error('FACILITY_NOT_FOUND');
  end if;
  if p_resource_id is not null
     and not exists (select 1 from public.resources r where r.id = p_resource_id and r.facility_id = p_facility_id) then
    perform private.raise_error('INVALID_RESOURCE');
  end if;

  v_start := private.jakarta_ts(p_start_date, p_start_time);
  v_end   := private.jakarta_ts(p_end_date, p_end_time);
  if extract(epoch from v_start)::bigint % 1800 <> 0 or extract(epoch from v_end)::bigint % 1800 <> 0
     or v_end <= v_start then
    perform private.raise_error('INVALID_BLOCK_TIME');
  end if;
  if v_end <= v_now then
    perform private.raise_error('BLOCK_IN_PAST');
  end if;

  -- Same lock as create_booking: a booking and a block on this facility serialize.
  perform 1 from public.resources r where r.facility_id = p_facility_id order by r.id for update;

  select coalesce(jsonb_agg(private.booking_json(b, true) order by b.start_at), '[]'::jsonb)
  into v_conflicts
  from public.bookings b
  where b.facility_id = p_facility_id
    and (p_resource_id is null or b.resource_id = p_resource_id)
    and b.time_range && tstzrange(v_start, v_end, '[)')
    and private.booking_is_live(b.status, b.start_at, b.end_at, v_now, v_s.checkin_late_minutes);

  if jsonb_array_length(v_conflicts) > 0 and not coalesce(p_cancel_conflicts, false) then
    perform private.raise_error('BLOCK_CONFLICTS', jsonb_build_object('conflicts', v_conflicts));
  end if;

  for v_b in
    select b.* from public.bookings b
    where b.facility_id = p_facility_id
      and (p_resource_id is null or b.resource_id = p_resource_id)
      and b.time_range && tstzrange(v_start, v_end, '[)')
      and private.booking_is_live(b.status, b.start_at, b.end_at, v_now, v_s.checkin_late_minutes)
    order by b.id
    for update
  loop
    update public.bookings
    set status = 'ADMIN_CANCELLED', cancelled_at = v_now, cancelled_by = v_admin,
        cancellation_type = 'SYSTEM_BLOCK',
        cancellation_reason = 'Facility unavailable: ' || p_reason_type
    where id = v_b.id
    returning * into v_b;
    v_cancelled := v_cancelled || jsonb_build_array(private.booking_json(v_b, true));
  end loop;

  insert into public.facility_blocks (facility_id, resource_id, start_at, end_at, reason_type, note, created_by)
  values (p_facility_id, p_resource_id, v_start, v_end, p_reason_type, nullif(btrim(p_note), ''), v_admin)
  returning * into v_block;

  perform private.log_admin_action(v_admin, 'BLOCK_CREATED', 'facility_block', v_block.id,
    jsonb_build_object('facility_id', p_facility_id, 'resource_id', p_resource_id,
                       'start_at', v_start, 'end_at', v_end, 'reason_type', p_reason_type,
                       'cancelled_booking_ids',
                       (select coalesce(jsonb_agg(c -> 'id'), '[]'::jsonb) from jsonb_array_elements(v_cancelled) c)));

  return jsonb_build_object('block', to_jsonb(v_block) - 'time_range', 'cancelled_bookings', v_cancelled);
end;
$$;

create or replace function public.admin_remove_block(p_block_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_block public.facility_blocks;
begin
  select * into v_block from public.facility_blocks k where k.id = p_block_id and k.removed_at is null for update;
  if not found then
    perform private.raise_error('BLOCK_NOT_FOUND');
  end if;
  if v_block.end_at <= private.now() then
    perform private.raise_error('BLOCK_ALREADY_ENDED');
  end if;

  update public.facility_blocks set removed_at = private.now(), removed_by = v_admin
  where id = v_block.id returning * into v_block;

  perform private.log_admin_action(v_admin, 'BLOCK_REMOVED', 'facility_block', v_block.id,
    jsonb_build_object('facility_id', v_block.facility_id, 'start_at', v_block.start_at, 'end_at', v_block.end_at));

  return to_jsonb(v_block) - 'time_range';
end;
$$;

create or replace function public.admin_list_blocks(p_include_past boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_now   timestamptz := private.now();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', k.id,
      'facility', jsonb_build_object('id', f.id, 'code', f.code, 'name', f.name),
      'resource', case when r.id is null then null else jsonb_build_object('id', r.id, 'name', r.name) end,
      'start_at', k.start_at, 'end_at', k.end_at,
      'start_local', to_char(k.start_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
      'end_local', to_char(k.end_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
      'reason_type', k.reason_type, 'note', k.note,
      'created_by', jsonb_build_object('id', p.id, 'full_name', p.full_name),
      'created_at', k.created_at, 'removed_at', k.removed_at,
      'can_remove', k.removed_at is null and k.end_at > v_now
    ) order by k.start_at)
    from public.facility_blocks k
    join public.facilities f on f.id = k.facility_id
    left join public.resources r on r.id = k.resource_id
    join public.profiles p on p.id = k.created_by
    where p_include_past or (k.removed_at is null and k.end_at > v_now)
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Users
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_users(p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin  uuid := private.require_admin();
  v_late   integer := (private.settings()).checkin_late_minutes;
  v_now    timestamptz := private.now();
  v_search text := nullif(btrim(p_search), '');
begin
  if p_limit not between 1 and 200 or p_offset < 0 then
    perform private.raise_error('INVALID_INPUT');
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.profiles p
              where v_search is null or p.full_name ilike '%' || v_search || '%' or p.email ilike '%' || v_search || '%'),
    'items', coalesce((
      select jsonb_agg(u order by u ->> 'full_name')
      from (
        select jsonb_build_object(
          'id', p.id, 'full_name', p.full_name, 'email', p.email, 'role', p.role,
          'is_active', p.is_active, 'deactivated_at', p.deactivated_at, 'created_at', p.created_at,
          'email_verified', au.email_confirmed_at is not null,
          'upcoming_bookings', (select count(*) from public.bookings b where b.user_id = p.id
                                and private.booking_is_live(b.status, b.start_at, b.end_at, v_now, v_late)),
          'total_bookings', (select count(*) from public.bookings b where b.user_id = p.id),
          'no_shows', (select count(*) from public.bookings b where b.user_id = p.id
                       and private.effective_status(b.status, b.start_at, b.end_at, v_now, v_late) = 'NO_SHOW')
        ) as u
        from public.profiles p
        join auth.users au on au.id = p.id
        where v_search is null or p.full_name ilike '%' || v_search || '%' or p.email ilike '%' || v_search || '%'
        order by p.full_name
        limit p_limit offset p_offset
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Locks every active admin row (id order) so two admins cannot concurrently remove
-- each other and leave the system with no administrator.
create or replace function private.assert_not_last_admin(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.profiles p where p.role = 'ADMIN' and p.is_active order by p.id for update;
  if exists (select 1 from public.profiles p where p.id = p_target and p.role = 'ADMIN' and p.is_active)
     and (select count(*) from public.profiles p where p.role = 'ADMIN' and p.is_active and p.id <> p_target) = 0 then
    perform private.raise_error('LAST_ADMIN');
  end if;
end;
$$;

create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin     uuid := private.require_admin();
  v_now       timestamptz := private.now();
  v_p         public.profiles;
  v_cancelled integer := 0;
begin
  if p_user_id is null or p_active is null or char_length(p_reason) > 500 then
    perform private.raise_error('INVALID_INPUT');
  end if;
  if not p_active then
    perform private.assert_not_last_admin(p_user_id);
  end if;

  select * into v_p from public.profiles p where p.id = p_user_id for update;
  if not found then
    perform private.raise_error('USER_NOT_FOUND');
  end if;
  if v_p.is_active = p_active then
    return to_jsonb(v_p) || jsonb_build_object('cancelled_bookings', 0);
  end if;

  update public.profiles
  set is_active = p_active,
      deactivated_at = case when p_active then null else v_now end,
      deactivated_by = case when p_active then null else v_admin end
  where id = p_user_id
  returning * into v_p;

  if not p_active then
    -- Free the resources held by future bookings of the deactivated user.
    with future as (
      select b.id from public.bookings b
      where b.user_id = p_user_id and b.status = 'CONFIRMED' and b.start_at > v_now
      order by b.id
      for update
    )
    update public.bookings b
    set status = 'ADMIN_CANCELLED', cancelled_at = v_now, cancelled_by = v_admin,
        cancellation_type = 'SYSTEM_DEACTIVATION', cancellation_reason = 'Account deactivated'
    from future where b.id = future.id;
    get diagnostics v_cancelled = row_count;
  end if;

  perform private.log_admin_action(v_admin, case when p_active then 'USER_ACTIVATED' else 'USER_DEACTIVATED' end,
    'profile', p_user_id, jsonb_build_object('reason', nullif(btrim(p_reason), ''), 'cancelled_bookings', v_cancelled));

  return to_jsonb(v_p) || jsonb_build_object('cancelled_bookings', v_cancelled);
end;
$$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_p     public.profiles;
  v_old   text;
begin
  if p_role not in ('USER', 'ADMIN') then
    perform private.raise_error('INVALID_ROLE');
  end if;
  if p_role = 'USER' then
    perform private.assert_not_last_admin(p_user_id);
  end if;

  select * into v_p from public.profiles p where p.id = p_user_id for update;
  if not found then
    perform private.raise_error('USER_NOT_FOUND');
  end if;
  v_old := v_p.role;

  update public.profiles set role = p_role where id = p_user_id returning * into v_p;

  if v_old <> p_role then
    perform private.log_admin_action(v_admin, 'USER_ROLE_CHANGED', 'profile', p_user_id,
      jsonb_build_object('from', v_old, 'to', p_role));
  end if;
  return to_jsonb(v_p);
end;
$$;

-- -----------------------------------------------------------------------------
-- Settings
-- -----------------------------------------------------------------------------
-- NULL arguments keep the current value. Opening hours and slot size are
-- migration-only by design (they change the meaning of existing bookings).
create or replace function public.admin_update_settings(
  p_booking_horizon_days  integer default null,
  p_max_active_bookings   integer default null,
  p_checkin_early_minutes integer default null,
  p_checkin_late_minutes  integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_old   public.app_settings;
  v_new   public.app_settings;
begin
  select * into v_old from public.app_settings where id for update;
  begin
    update public.app_settings set
      booking_horizon_days  = coalesce(p_booking_horizon_days, booking_horizon_days),
      max_active_bookings   = coalesce(p_max_active_bookings, max_active_bookings),
      checkin_early_minutes = coalesce(p_checkin_early_minutes, checkin_early_minutes),
      checkin_late_minutes  = coalesce(p_checkin_late_minutes, checkin_late_minutes),
      updated_by = v_admin
    where id
    returning * into v_new;
  exception when check_violation then
    perform private.raise_error('INVALID_SETTINGS');
  end;

  perform private.log_admin_action(v_admin, 'SETTINGS_UPDATED', 'app_settings', null,
    jsonb_build_object('before', to_jsonb(v_old), 'after', to_jsonb(v_new)));
  return to_jsonb(v_new);
end;
$$;

-- -----------------------------------------------------------------------------
-- Dashboard & basic analytics
-- -----------------------------------------------------------------------------
create or replace function public.admin_dashboard(p_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_s     public.app_settings := private.settings();
  v_now   timestamptz := private.now();
  v_date  date := coalesce(p_date, private.jakarta_today());
  v_open_minutes integer := (extract(epoch from (v_s.close_time - v_s.open_time)) / 60)::integer;
begin
  return jsonb_build_object(
    'date', v_date,
    'bookings_on_date', (select count(*) from public.bookings b
                         where b.local_date = v_date and b.status not in ('CANCELLED', 'ADMIN_CANCELLED')),
    'upcoming_bookings', (select count(*) from public.bookings b
                          where b.start_at > v_now
                            and private.booking_is_live(b.status, b.start_at, b.end_at, v_now, v_s.checkin_late_minutes)),
    'checked_in_on_date', (select count(*) from public.bookings b
                           where b.local_date = v_date and b.status in ('CHECKED_IN', 'COMPLETED')),
    'no_shows_last_7_days', (select count(*) from public.bookings b
                             where b.local_date between v_date - 6 and v_date
                               and private.effective_status(b.status, b.start_at, b.end_at, v_now, v_s.checkin_late_minutes) = 'NO_SHOW'),
    'active_users', (select count(*) from public.profiles p where p.is_active),
    'utilization', coalesce((
      select jsonb_agg(jsonb_build_object(
        'facility_id', f.id, 'name', f.name,
        'booked_minutes', coalesce(bm.minutes, 0),
        'capacity_minutes', rc.cnt * v_open_minutes,
        'utilization_pct', case when rc.cnt = 0 then 0
                                else round(100.0 * coalesce(bm.minutes, 0) / (rc.cnt * v_open_minutes), 1) end
      ) order by f.sort_order)
      from public.facilities f
      cross join lateral (select count(*) as cnt from public.resources r where r.facility_id = f.id and r.is_active) rc
      left join lateral (
        select sum(b.duration_minutes) as minutes from public.bookings b
        where b.facility_id = f.id and b.local_date = v_date
          and b.status not in ('CANCELLED', 'ADMIN_CANCELLED')
      ) bm on true
      where f.is_active
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_stats(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := private.require_admin();
  v_s     public.app_settings := private.settings();
  v_now   timestamptz := private.now();
  v_days  integer;
  v_open_minutes integer := (extract(epoch from (v_s.close_time - v_s.open_time)) / 60)::integer;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    perform private.raise_error('INVALID_INPUT');
  end if;
  v_days := p_to - p_from + 1;

  return (
  with stats_bookings as (
    select b.*, private.effective_status(b.status, b.start_at, b.end_at, v_now, v_s.checkin_late_minutes) as eff
    from public.bookings b where b.local_date between p_from and p_to
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', (select jsonb_build_object(
        'bookings', count(*) filter (where eff not in ('CANCELLED', 'ADMIN_CANCELLED')),
        'cancelled_by_user', count(*) filter (where eff = 'CANCELLED'),
        'cancelled_by_admin', count(*) filter (where eff = 'ADMIN_CANCELLED'),
        'no_shows', count(*) filter (where eff = 'NO_SHOW'),
        'completed', count(*) filter (where eff = 'COMPLETED'))
      from stats_bookings),
    'by_facility', coalesce((
      select jsonb_agg(jsonb_build_object(
        'facility_id', f.id, 'name', f.name,
        'bookings', coalesce(x.bookings, 0),
        'booked_minutes', coalesce(x.minutes, 0),
        'cancellations', coalesce(x.cancellations, 0),
        'no_shows', coalesce(x.no_shows, 0),
        'utilization_pct', case when rc.cnt = 0 then 0
          else round(100.0 * coalesce(x.minutes, 0) / (rc.cnt * v_open_minutes * v_days), 1) end
      ) order by coalesce(x.bookings, 0) desc, f.sort_order)
      from public.facilities f
      cross join lateral (select count(*) as cnt from public.resources r where r.facility_id = f.id and r.is_active) rc
      left join lateral (
        select count(*) filter (where sb.eff not in ('CANCELLED', 'ADMIN_CANCELLED')) as bookings,
               sum(sb.duration_minutes) filter (where sb.eff not in ('CANCELLED', 'ADMIN_CANCELLED')) as minutes,
               count(*) filter (where sb.eff in ('CANCELLED', 'ADMIN_CANCELLED')) as cancellations,
               count(*) filter (where sb.eff = 'NO_SHOW') as no_shows
        from stats_bookings sb where sb.facility_id = f.id
      ) x on true
    ), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('date', d::date, 'bookings',
        (select count(*) from stats_bookings sb
         where sb.local_date = d::date and sb.eff not in ('CANCELLED', 'ADMIN_CANCELLED'))) order by d)
      from generate_series(p_from, p_to, interval '1 day') d
    ), '[]'::jsonb),
    'by_hour', coalesce((
      select jsonb_agg(jsonb_build_object('hour', h.hour, 'bookings', h.cnt) order by h.hour)
      from (select extract(hour from sb.start_at at time zone 'Asia/Jakarta')::integer as hour, count(*) as cnt
            from stats_bookings sb where sb.eff not in ('CANCELLED', 'ADMIN_CANCELLED')
            group by 1) h
    ), '[]'::jsonb)
  ));
end;
$$;
