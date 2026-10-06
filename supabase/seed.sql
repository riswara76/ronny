-- Local development seed (runs on `supabase db reset` only, never on hosted projects).
-- Facilities, activities, resources and settings are reference data and live in
-- migrations/20261006000300_reference_data.sql so they also reach production.
-- Test accounts are created through the Auth API by scripts/create-test-users.mjs,
-- never with committed passwords.
select 1;
