-- Registration trigger, verification gate, deactivation gate, profile privileges.
begin;
\ir _helpers.psql
select plan(14);

-- Sign-up creates a USER profile even if the client asks for ADMIN in metadata.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values (tests.uid('sneaky'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'sneaky@gmail.com', '{"full_name":"Sneaky User","role":"ADMIN"}', now(), now());
select is((select role from public.profiles where id = tests.uid('sneaky')), 'USER',
  'sign-up always creates role USER, ignoring client metadata');
select is((select email from public.profiles where id = tests.uid('sneaky')), 'sneaky@gmail.com',
  'any email domain may register (decision D1)');

select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (tests.uid('noname'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'noname@test.dcu', '{}', now(), now())$$,
  'P0001', 'INVALID_FULL_NAME', 'sign-up without a full name is rejected');

update auth.users set email = 'sneaky.new@gmail.com' where id = tests.uid('sneaky');
select is((select email from public.profiles where id = tests.uid('sneaky')), 'sneaky.new@gmail.com',
  'email change in Auth is synced to the profile');

-- Unverified email cannot use booking RPCs (server-side backstop).
select tests.login('sneaky');
select throws_ok($$select public.get_availability(tests.fac('TENNIS'), '2030-01-08')$$,
  'P0001', 'EMAIL_NOT_VERIFIED', 'unverified user cannot read availability');
select throws_ok($$select tests.book('TENNIS', '2030-01-08', '18:00', 60)$$,
  'P0001', 'EMAIL_NOT_VERIFIED', 'unverified user cannot book');
reset role;

-- No JWT at all.
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select throws_ok($$select public.get_app_config()$$, 'P0001', 'NOT_AUTHENTICATED', 'no identity -> NOT_AUTHENTICATED');
reset role;

-- Deactivated user with a still-valid JWT is rejected immediately.
select tests.create_user('dora');
update public.profiles set is_active = false, deactivated_at = now() where id = tests.uid('dora');
select tests.login('dora');
select throws_ok($$select tests.book('TENNIS', '2030-01-08', '18:00', 60)$$,
  'P0001', 'ACCOUNT_DISABLED', 'deactivated user cannot book even with a valid JWT');
select throws_ok($$select public.get_my_bookings()$$, 'P0001', 'ACCOUNT_DISABLED', 'deactivated user cannot list bookings');
reset role;

-- Profile privileges.
select tests.create_user('alice', 'Alice Anderson');
select tests.login('alice');
select lives_ok($$update public.profiles set full_name = 'Alice A.' where id = tests.uid('alice')$$,
  'user can change own full name');
select throws_ok($$update public.profiles set role = 'ADMIN' where id = tests.uid('alice')$$,
  '42501', null, 'user cannot change own role');
select throws_ok($$update public.profiles set is_active = true where id = tests.uid('alice')$$,
  '42501', null, 'user cannot change own active flag');
select is((select count(*)::int from public.profiles), 1, 'user sees only their own profile');
reset role;
select is((select full_name from public.profiles where id = tests.uid('alice')), 'Alice A.', 'name change persisted');

select * from finish();
rollback;
