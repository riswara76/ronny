-- STAGING ONLY. Releases slots held by automated-test accounts so the E2E/concurrency suites can
-- re-run on the same days. Test accounts are identified by the reserved test domain (example.com)
-- or by plus-addresses of the dedicated test mailbox (:'mailbox_local'+…@:'mailbox_domain').
-- Bookings are never deleted (trigger forbids it): they are admin-cancelled, which frees the resource.
\set ON_ERROR_STOP on
with test_users as (
  select id from public.profiles
  where email like '%@example.com'
     or (:'mailbox_local' <> '' and email like :'mailbox_local' || '+%@' || :'mailbox_domain')
)
update public.bookings b
set status = 'ADMIN_CANCELLED', cancelled_at = now(), cancellation_type = 'ADMIN',
    cancellation_reason = 'Automated test cleanup (staging)'
where b.status in ('CONFIRMED', 'CHECKED_IN') and b.user_id in (select id from test_users);

update public.facility_blocks k
set removed_at = now(), removed_by = k.created_by
where k.removed_at is null
  and k.created_by in (select id from public.profiles where email like '%@example.com');
