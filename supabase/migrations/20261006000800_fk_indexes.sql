-- DCU Active — Phase 4 hardening: covering indexes for foreign keys
-- (Supabase Performance Advisor lint 0001 "unindexed_foreign_keys").
-- Performance only: no behaviour, permission or business-rule change.

create index if not exists bookings_facility_activity_idx on public.bookings (facility_id, activity_id);
create index if not exists bookings_facility_resource_idx on public.bookings (facility_id, resource_id);
create index if not exists bookings_cancelled_by_idx on public.bookings (cancelled_by) where cancelled_by is not null;
create index if not exists facility_blocks_facility_resource_idx on public.facility_blocks (facility_id, resource_id);
create index if not exists facility_blocks_created_by_idx on public.facility_blocks (created_by);
create index if not exists facility_blocks_removed_by_idx on public.facility_blocks (removed_by) where removed_by is not null;
create index if not exists profiles_deactivated_by_idx on public.profiles (deactivated_by) where deactivated_by is not null;
create index if not exists admin_actions_admin_idx on public.admin_actions (admin_id);
create index if not exists app_settings_updated_by_idx on public.app_settings (updated_by);
