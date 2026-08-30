-- Run after migration 20260830_07 in staging or a disposable database.
-- Read-only schema contract checks; no production data is modified.

do $$
declare
  required_table text;
  required_column record;
begin
  foreach required_table in array array[
    'device_components',
    'component_health_events',
    'maintenance_sessions',
    'device_state_snapshots',
    'audit_logs'
  ] loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'Missing STS Core table: %', required_table;
    end if;
  end loop;

  for required_column in
    select * from (values
      ('component_health_events', 'health_state'),
      ('component_health_events', 'diagnostic_confidence'),
      ('maintenance_sessions', 'maintenance_state'),
      ('maintenance_sessions', 'reason'),
      ('maintenance_sessions', 'notification_policy'),
      ('device_state_snapshots', 'operational_state'),
      ('device_state_snapshots', 'component_health_state'),
      ('device_state_snapshots', 'communication_state'),
      ('device_state_snapshots', 'maintenance_state'),
      ('audit_logs', 'action'),
      ('audit_logs', 'result')
    ) as expected(table_name, column_name)
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = required_column.table_name
        and c.column_name = required_column.column_name
    ) then
      raise exception 'Missing STS Core column %.%',
        required_column.table_name, required_column.column_name;
    end if;
  end loop;

  if to_regprocedure('public.sts_set_device_maintenance(text,integer,text,text)') is null then
    raise exception 'Missing maintenance lifecycle RPC.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'maintenance_sessions_one_active_uidx'
  ) then
    raise exception 'Missing one-active-maintenance invariant.';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('component_health_events', 'device_state_snapshots', 'audit_logs')
      and grantee = 'authenticated'
      and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
  ) then
    raise exception 'Append-only Core tables expose mutation privileges.';
  end if;
end;
$$;

select 'STS Global Foundation v1 Core schema checks passed' as result;
