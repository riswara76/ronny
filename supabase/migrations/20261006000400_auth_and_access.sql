-- DCU Active — Supabase Auth integration and authorization helpers.

-- -----------------------------------------------------------------------------
-- Registration policy hook (Phase 2 decision D1)
-- -----------------------------------------------------------------------------
-- V1: any valid email may register; verification is mandatory (enforced by Auth
-- "Confirm email" plus the email check in private.require_active_user()).
--
-- Future restriction (allowed domains, invitation codes, approved-user whitelist)
-- is added HERE without touching the booking engine: raise an exception to reject
-- the sign-up. Corporate SSO would create users through Auth the same way and pass
-- through this hook too.
create or replace function private.assert_registration_allowed(p_email text, p_metadata jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  -- V1: open registration.
  return;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profile creation / email sync
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
begin
  perform private.assert_registration_allowed(new.email, new.raw_user_meta_data);

  if char_length(v_full_name) < 2 or char_length(v_full_name) > 100 then
    raise exception using errcode = 'P0001', message = 'INVALID_FULL_NAME';
  end if;

  -- Role is ALWAYS 'USER' here, whatever the client put in its sign-up metadata.
  insert into public.profiles (id, full_name, email, role)
  values (new.id, v_full_name, coalesce(new.email, ''), 'USER');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function private.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_auth_user_email_change();

-- -----------------------------------------------------------------------------
-- Authorization helpers
-- -----------------------------------------------------------------------------
-- Admin status is read from the database on every call (never from JWT claims),
-- so demotion or deactivation takes effect immediately.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'ADMIN' and p.is_active
  );
$$;

-- Every user-facing RPC starts with this. Returns the caller's id or raises.
-- A deactivated user is rejected here even while their JWT is still valid.
create or replace function private.require_active_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_active    boolean;
  v_confirmed timestamptz;
begin
  if v_uid is null then
    perform private.raise_error('NOT_AUTHENTICATED');
  end if;

  select p.is_active into v_active from public.profiles p where p.id = v_uid;
  if not found then
    perform private.raise_error('PROFILE_NOT_FOUND');
  end if;
  if not v_active then
    perform private.raise_error('ACCOUNT_DISABLED');
  end if;

  select u.email_confirmed_at into v_confirmed from auth.users u where u.id = v_uid;
  if v_confirmed is null then
    perform private.raise_error('EMAIL_NOT_VERIFIED');
  end if;

  return v_uid;
end;
$$;

create or replace function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if not private.is_admin() then
    perform private.raise_error('NOT_AUTHORIZED');
  end if;
  return v_uid;
end;
$$;

create or replace function private.log_admin_action(
  p_admin_id uuid, p_action text, p_target_type text, p_target_id uuid, p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_actions (admin_id, action, target_type, target_id, details)
  values (p_admin_id, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;
