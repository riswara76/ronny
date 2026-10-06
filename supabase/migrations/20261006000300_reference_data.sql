-- DCU Active — reference data required in every environment (local, staging, production).
-- Kept in a migration (not seed.sql) because `supabase db push` does not run seed.sql
-- and the app cannot work without facilities. Idempotent by natural keys.

insert into public.app_settings (id) values (true)
on conflict (id) do nothing;

insert into public.facilities (code, name, icon_key, allowed_durations, sort_order) values
  ('TENNIS',            'Tennis',              'sports_tennis',        array[30, 60, 90], 10),
  ('BASKETBALL_FUTSAL', 'Basketball / Futsal', 'sports_basketball',    array[30, 60, 90], 20),
  ('TABLE_TENNIS',      'Table Tennis',        'sports_handball',      array[30],         30),
  ('FOOTBALL',          'Football',            'sports_soccer',        array[30],         40),
  ('AIR_HOCKEY',        'Air Hockey',          'sports_hockey',        array[30],         50),
  ('FOOSBALL',          'Foosball',            'sports_esports',       array[30],         60)
on conflict (code) do nothing;

insert into public.activities (facility_id, code, name, sort_order)
select f.id, a.code, a.name, a.sort_order
from (values
  ('TENNIS',            'TENNIS',       'Tennis',       10),
  ('BASKETBALL_FUTSAL', 'BASKETBALL',   'Basketball',   10),
  ('BASKETBALL_FUTSAL', 'FUTSAL',       'Futsal',       20),
  ('TABLE_TENNIS',      'TABLE_TENNIS', 'Table Tennis', 10),
  ('FOOTBALL',          'FOOTBALL',     'Football',     10),
  ('AIR_HOCKEY',        'AIR_HOCKEY',   'Air Hockey',   10),
  ('FOOSBALL',          'FOOSBALL',     'Foosball',     10)
) as a (facility_code, code, name, sort_order)
join public.facilities f on f.code = a.facility_code
on conflict (facility_id, code) do nothing;

insert into public.resources (facility_id, name, sort_order)
select f.id, r.name, r.sort_order
from (values
  ('TENNIS',            'Tennis Court',         10),
  ('BASKETBALL_FUTSAL', 'Multipurpose Court 1', 10),
  ('TABLE_TENNIS',      'Table Tennis Table',   10),
  ('FOOTBALL',          'Football Field',       10),
  ('AIR_HOCKEY',        'Air Hockey Table 1',   10),
  ('AIR_HOCKEY',        'Air Hockey Table 2',   20),
  ('FOOSBALL',          'Foosball Table 1',     10),
  ('FOOSBALL',          'Foosball Table 2',     20)
) as r (facility_code, name, sort_order)
join public.facilities f on f.code = r.facility_code
on conflict (facility_id, name) do nothing;
