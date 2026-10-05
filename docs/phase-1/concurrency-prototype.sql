-- PHASE 1 EXPLORATORY PROTOTYPE — NOT PRODUCTION CODE.
-- Purpose: prove the concurrency design in PHASE-1-ARCHITECTURE.md §E on PostgreSQL 16.
-- Simplified schema (int ids, no RLS, no rules). pg_sleep(0.05) deliberately widens the race window.
-- Results recorded in PHASE-1-ARCHITECTURE.md §E.5.

create extension if not exists btree_gist;
create table profiles(id uuid primary key);
create table facilities(id int primary key, name text);
create table resources(id int primary key, facility_id int references facilities, sort_order int);
create table bookings(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  facility_id int not null, resource_id int not null references resources,
  start_at timestamptz not null, end_at timestamptz not null,
  time_range tstzrange generated always as (tstzrange(start_at,end_at,'[)')) stored,
  local_date date generated always as ((start_at at time zone 'Asia/Jakarta')::date) stored,
  status text not null default 'CONFIRMED',
  constraint no_resource_overlap exclude using gist (resource_id with =, time_range with &&) where (status in ('CONFIRMED','CHECKED_IN')),
  constraint no_user_overlap exclude using gist (user_id with =, time_range with &&) where (status in ('CONFIRMED','CHECKED_IN'))
);
create unique index one_per_facility_day on bookings(user_id, facility_id, local_date) where status not in ('CANCELLED','ADMIN_CANCELLED');
create table facility_blocks(id serial primary key, resource_id int references resources, time_range tstzrange not null);

create or replace function create_booking(p_user uuid, p_facility int, p_date date, p_start time, p_minutes int)
returns int language plpgsql as $$
declare v_start timestamptz := (p_date + p_start) at time zone 'Asia/Jakarta';
        v_end timestamptz := v_start + make_interval(mins => p_minutes);
        v_res int;
begin
  perform 1 from profiles where id = p_user for update;
  perform 1 from resources where facility_id = p_facility order by id for update;
  perform pg_sleep(0.05); -- widen the race window deliberately
  select r.id into v_res from resources r
   where r.facility_id = p_facility
     and not exists (select 1 from bookings b where b.resource_id=r.id and b.status in ('CONFIRMED','CHECKED_IN') and b.time_range && tstzrange(v_start,v_end,'[)'))
     and not exists (select 1 from facility_blocks k where k.resource_id=r.id and k.time_range && tstzrange(v_start,v_end,'[)'))
   order by r.sort_order limit 1;
  if v_res is null then raise exception 'SLOT_UNAVAILABLE'; end if;
  insert into bookings(user_id,facility_id,resource_id,start_at,end_at) values (p_user,p_facility,v_res,v_start,v_end);
  return v_res;
end $$;

-- same race but WITHOUT the locks: proves the exclusion constraint alone is a hard backstop
create or replace function create_booking_nolock(p_user uuid, p_facility int, p_date date, p_start time, p_minutes int)
returns int language plpgsql as $$
declare v_start timestamptz := (p_date + p_start) at time zone 'Asia/Jakarta';
        v_end timestamptz := v_start + make_interval(mins => p_minutes); v_res int;
begin
  select r.id into v_res from resources r where r.facility_id = p_facility
     and not exists (select 1 from bookings b where b.resource_id=r.id and b.status in ('CONFIRMED','CHECKED_IN') and b.time_range && tstzrange(v_start,v_end,'[)'))
   order by r.sort_order limit 1;
  perform pg_sleep(0.05);
  if v_res is null then raise exception 'SLOT_UNAVAILABLE'; end if;
  insert into bookings(user_id,facility_id,resource_id,start_at,end_at) values (p_user,p_facility,v_res,v_start,v_end);
  return v_res;
end $$;

insert into facilities values (1,'Tennis'),(5,'Air Hockey');
insert into resources values (10,1,1),(50,5,1),(51,5,2);
insert into profiles select gen_random_uuid() from generate_series(1,6);
