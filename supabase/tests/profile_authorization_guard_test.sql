-- Negative authorization test for migration 09.
-- Runs only in a transaction and leaves no users or tenant data behind.

begin;

do $$
declare
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  admin_user uuid := gen_random_uuid();
  client_a uuid := gen_random_uuid();
  client_b uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'sts-profile-guard-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'sts-profile-guard-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (admin_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'sts-profile-guard-admin@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.clients (id, code, name) values
    (client_a, 'PROFILE-GUARD-A', 'Profile Guard Client A'),
    (client_b, 'PROFILE-GUARD-B', 'Profile Guard Client B');

  insert into public.profiles (id, email, full_name, role, is_active, client_id)
  values
    (user_a, 'sts-profile-guard-a@example.invalid', 'Guard A', 'viewer', true, client_a),
    (user_b, 'sts-profile-guard-b@example.invalid', 'Guard B', 'viewer', true, client_b),
    (admin_user, 'sts-profile-guard-admin@example.invalid', 'Guard Admin', 'super_admin', true, null)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    is_active = excluded.is_active,
    client_id = excluded.client_id;

  insert into public.client_users (client_id, user_id, role) values
    (client_a, user_a, 'owner'),
    (client_b, user_b, 'owner');

  perform set_config('sts_test.guard_user_a', user_a::text, true);
  perform set_config('sts_test.guard_user_b', user_b::text, true);
  perform set_config('sts_test.guard_admin', admin_user::text, true);
  perform set_config('sts_test.guard_client_a', client_a::text, true);
  perform set_config('sts_test.guard_client_b', client_b::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('sts_test.guard_user_a'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  escalation_blocked boolean := false;
  affected integer := 0;
  visible_a integer := 0;
  leaked_b integer := 0;
begin
  begin
    update public.profiles
    set role = 'super_admin'
    where id = auth.uid();
  exception
    when insufficient_privilege then
      escalation_blocked := true;
  end;

  if not escalation_blocked then
    raise exception 'CRITICAL: common user can change own role';
  end if;

  if exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  ) then
    raise exception 'CRITICAL: common user became super_admin';
  end if;

  update public.profiles
  set full_name = 'Guard A Updated'
  where id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'ordinary self-profile update was unexpectedly blocked';
  end if;

  select count(*) into visible_a
  from public.clients
  where id = current_setting('sts_test.guard_client_a')::uuid;
  select count(*) into leaked_b
  from public.clients
  where id = current_setting('sts_test.guard_client_b')::uuid;
  if visible_a <> 1 or leaked_b <> 0 then
    raise exception 'tenant isolation failed after profile guard: own %, leaked %', visible_a, leaked_b;
  end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('sts_test.guard_admin'), true);

do $$
declare
  affected integer := 0;
begin
  update public.profiles
  set role = 'client_admin'
  where id = current_setting('sts_test.guard_user_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'authorized super_admin could not update a managed role';
  end if;
end $$;

reset role;
rollback;
