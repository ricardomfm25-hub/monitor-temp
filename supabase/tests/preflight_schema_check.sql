-- Run before the 20260819 migrations and retain the output with deployment notes.
-- This repository does not contain the original base-schema migration.

do $$
declare
  missing text[] := array[]::text[];
begin
  if to_regclass('public.devices') is null then missing := array_append(missing, 'public.devices'); end if;
  if to_regclass('public.readings') is null then missing := array_append(missing, 'public.readings'); end if;
  if to_regclass('public.alerts') is null then missing := array_append(missing, 'public.alerts'); end if;
  if to_regclass('public.profiles') is null then missing := array_append(missing, 'public.profiles'); end if;
  if to_regclass('public.device_access') is null then missing := array_append(missing, 'public.device_access'); end if;

  if array_length(missing, 1) is not null then
    raise exception 'STS preflight failed; missing base tables: %', array_to_string(missing, ', ');
  end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='devices' and column_name='device_id') then
    raise exception 'STS preflight failed: devices.device_id missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='readings' and column_name='device_id') then
    raise exception 'STS preflight failed: readings.device_id missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='alerts' and column_name='device_id') then
    raise exception 'STS preflight failed: alerts.device_id missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='device_access' and column_name='user_id') then
    raise exception 'STS preflight failed: device_access.user_id missing';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='devices' and column_name='id'
      and data_type <> 'uuid'
  ) then
    raise exception 'STS preflight failed: existing devices.id is not UUID; rename it before applying the hierarchy migration.';
  end if;
end $$;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('devices','readings','alerts','profiles','device_access')
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('devices','readings','alerts','profiles','device_access')
order by tablename, policyname;
