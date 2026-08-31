-- Integration test for the STS normalized data architecture.
-- Run against a disposable/staging Supabase database after all migrations.
-- The transaction is always rolled back.

begin;

do $$
declare
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  product_id uuid := gen_random_uuid();
  model_id uuid := gen_random_uuid();
  client_a uuid := gen_random_uuid();
  client_b uuid := gen_random_uuid();
  site_a uuid := gen_random_uuid();
  site_b uuid := gen_random_uuid();
  space_a uuid := gen_random_uuid();
  space_b uuid := gen_random_uuid();
  device_a uuid := gen_random_uuid();
  device_b uuid := gen_random_uuid();
  sensor_a uuid := gen_random_uuid();
  sensor_b uuid := gen_random_uuid();
  component_a uuid := gen_random_uuid();
  component_b uuid := gen_random_uuid();
  batch_a uuid := gen_random_uuid();
  batch_b uuid := gen_random_uuid();
  event_alarm uuid := gen_random_uuid();
  event_maintenance uuid := gen_random_uuid();
  event_failure uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'sts-architecture-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'sts-architecture-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.products (id, code, name) values (product_id, 'TEST-COLD', 'STS Test Cold');
  insert into public.product_models (id, product_id, code, name, version)
    values (model_id, product_id, 'TEST-PRO', 'Test Pro', '1');
  insert into public.clients (id, code, name) values
    (client_a, 'TEST-CLIENT-A', 'Cliente A'),
    (client_b, 'TEST-CLIENT-B', 'Cliente B');
  insert into public.client_users (client_id, user_id, role) values
    (client_a, user_a, 'owner'),
    (client_b, user_b, 'owner');
  insert into public.sites (id, client_id, code, name) values
    (site_a, client_a, 'SITE-A', 'Site A'),
    (site_b, client_b, 'SITE-B', 'Site B');
  insert into public.spaces (id, site_id, code, name, space_type) values
    (space_a, site_a, 'SPACE-A', 'Câmara A', 'cold_room'),
    (space_b, site_b, 'SPACE-B', 'Câmara B', 'cold_room');

  insert into public.devices (
    id, device_id, name, location, product_model_id, space_id,
    config, config_version, status, updated_at
  ) values
    (device_a, 'STS-TEST-A', 'Device A', 'Câmara A', model_id, space_a, '{}'::jsonb, 1, 'NORMAL', now()),
    (device_b, 'STS-TEST-B', 'Device B', 'Câmara B', model_id, space_b, '{}'::jsonb, 1, 'NORMAL', now());

  insert into public.sensors (id, device_id, sensor_key, sensor_type, name, unit) values
    (sensor_a, device_a, 'interior_temperature', 'temperature', 'Temperatura interior', 'degC'),
    (sensor_b, device_b, 'interior_temperature', 'temperature', 'Temperatura interior', 'degC');
  insert into public.ingestion_batches (id, device_id, telemetry_seq, recorded_at, raw_payload) values
    (batch_a, device_a, 1, now() - interval '1 minute', '{"temperature":3.2}'::jsonb),
    (batch_b, device_b, 1, now() - interval '1 minute', '{"temperature":7.4}'::jsonb);
  insert into public.sensor_readings (ingestion_batch_id, sensor_id, recorded_at, value_numeric) values
    (batch_a, sensor_a, now() - interval '1 minute', 3.2),
    (batch_b, sensor_b, now() - interval '1 minute', 7.4);

  insert into public.device_components (id, device_id, component_key, component_type, name) values
    (component_a, device_a, 'dht22', 'temperature_humidity_sensor', 'DHT22 A'),
    (component_b, device_b, 'dht22', 'temperature_humidity_sensor', 'DHT22 B');
  insert into public.component_health_events (
    component_id, health_state, diagnostic_confidence, diagnostic_source, observed_at
  ) values
    (component_a, 'HEALTHY', 'OBSERVED', 'test', now()),
    (component_b, 'FAULT', 'OBSERVED', 'test', now());
  insert into public.audit_logs (
    client_id, actor_type, action, target_type, target_id, device_id, source, result
  ) values
    (client_a, 'system', 'test.created', 'device', 'STS-TEST-A', device_a, 'test', 'success'),
    (client_b, 'system', 'test.created', 'device', 'STS-TEST-B', device_b, 'test', 'success');
  insert into public.alerts (
    device_id, temperature, humidity, type, event, title, message, sent_at,
    alert_status
  ) values
    ('STS-TEST-A', 3.2, 65, 'temperature', 'triggered', 'Alert A', 'Tenant A', now(), 'OPEN'),
    ('STS-TEST-B', 7.4, 70, 'temperature', 'triggered', 'Alert B', 'Tenant B', now(), 'OPEN');

  insert into public.events (
    id, client_id, site_id, space_id, device_id, event_type, start_time, severity, source
  ) values
    (event_alarm, client_a, site_a, space_a, device_a, 'temperature_alarm', now() - interval '2 hours', 'critical', 'system'),
    (event_maintenance, client_a, site_a, space_a, device_a, 'maintenance_performed', now() - interval '1 hour', 'info', 'technician'),
    (event_failure, client_a, site_a, space_a, device_a, 'confirmed_failure', now(), 'critical', 'technician');
  insert into public.event_outcomes (
    event_id, diagnosis_code, action_type, outcome_code, is_ground_truth
  ) values
    (event_failure, 'compressor_failure', 'compressor_replaced', 'restored', true);

  perform set_config('sts_test.user_a', user_a::text, true);
  perform set_config('sts_test.user_b', user_b::text, true);
  perform set_config('sts_test.client_a', client_a::text, true);
  perform set_config('sts_test.client_b', client_b::text, true);
  perform set_config('sts_test.site_b', site_b::text, true);
  perform set_config('sts_test.device_a', device_a::text, true);
  perform set_config('sts_test.device_b', device_b::text, true);
  perform set_config('sts_test.sensor_a', sensor_a::text, true);
  perform set_config('sts_test.sensor_b', sensor_b::text, true);
  perform set_config('sts_test.batch_b', batch_b::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('sts_test.user_a'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  visible_a integer;
  leaked_b integer;
  readings_by_sensor integer;
  readings_by_space integer;
  readings_by_client integer;
  visible_devices integer;
  leaked_devices integer;
  event_count integer;
  ground_truth_count integer;
  own_component_health integer;
  leaked_component_health integer;
  own_audit integer;
  leaked_audit integer;
  own_alerts integer;
  leaked_alerts integer;
  affected integer;
  denied boolean;
  foreign_insert_id uuid := gen_random_uuid();
begin
  select count(*) into visible_a
  from public.clients where id = current_setting('sts_test.client_a')::uuid;
  select count(*) into leaked_b
  from public.clients where id = current_setting('sts_test.client_b')::uuid;
  if visible_a <> 1 or leaked_b <> 0 then
    raise exception 'RLS failure: Cliente A visibility %, Cliente B leak %', visible_a, leaked_b;
  end if;

  select count(*) into visible_devices from public.devices where device_id = 'STS-TEST-A';
  select count(*) into leaked_devices from public.devices where device_id = 'STS-TEST-B';
  if visible_devices <> 1 or leaked_devices <> 0 then
    raise exception 'Legacy devices RLS failure: own %, leaked %', visible_devices, leaked_devices;
  end if;

  select count(*) into readings_by_sensor
  from public.sensor_readings_context
  where sensor_id = current_setting('sts_test.sensor_a')::uuid
    and recorded_at >= now() - interval '1 hour';
  select count(*) into readings_by_space
  from public.sensor_readings_context
  where space_id = (select id from public.spaces where code = 'SPACE-A')
    and recorded_at >= now() - interval '1 hour';
  select count(*) into readings_by_client
  from public.sensor_readings_context
  where client_id = current_setting('sts_test.client_a')::uuid
    and recorded_at >= now() - interval '1 hour';
  if readings_by_sensor <> 1 or readings_by_space <> 1 or readings_by_client <> 1 then
    raise exception 'Ingestion query failure: sensor %, space %, client %', readings_by_sensor, readings_by_space, readings_by_client;
  end if;

  select count(*) into event_count from public.events
  where client_id = current_setting('sts_test.client_a')::uuid;
  select count(*) into ground_truth_count from public.ground_truth_context
  where client_id = current_setting('sts_test.client_a')::uuid and is_ground_truth;
  if event_count <> 3 or ground_truth_count <> 1 then
    raise exception 'Events/ground truth failure: events %, ground truth %', event_count, ground_truth_count;
  end if;

  select count(*) into own_component_health
  from public.component_health_events che
  join public.device_components dc on dc.id = che.component_id
  where dc.device_id = current_setting('sts_test.device_a')::uuid;
  select count(*) into leaked_component_health
  from public.component_health_events che
  join public.device_components dc on dc.id = che.component_id
  where dc.device_id <> current_setting('sts_test.device_a')::uuid;
  if own_component_health <> 1 or leaked_component_health <> 0 then
    raise exception 'Component Health RLS failure: own %, leaked %', own_component_health, leaked_component_health;
  end if;

  select count(*) into own_audit from public.audit_logs
  where client_id = current_setting('sts_test.client_a')::uuid;
  select count(*) into leaked_audit from public.audit_logs
  where client_id = current_setting('sts_test.client_b')::uuid;
  if own_audit <> 1 or leaked_audit <> 0 then
    raise exception 'Audit RLS failure: own %, leaked %', own_audit, leaked_audit;
  end if;

  select count(*) into own_alerts from public.alerts where device_id = 'STS-TEST-A';
  select count(*) into leaked_alerts from public.alerts where device_id = 'STS-TEST-B';
  if own_alerts <> 1 or leaked_alerts <> 0 then
    raise exception 'Alert RLS failure: own %, leaked %', own_alerts, leaked_alerts;
  end if;

  update public.clients set name = name
  where id = current_setting('sts_test.client_b')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cliente A updated Cliente B.'; end if;

  denied := false;
  begin
    insert into public.sensor_readings (
      id, ingestion_batch_id, sensor_id, recorded_at, value_numeric
    ) values (
      foreign_insert_id,
      current_setting('sts_test.batch_b')::uuid,
      current_setting('sts_test.sensor_b')::uuid,
      now(), 8.1
    );
  exception when others then
    denied := true;
  end;
  if not denied and exists (
    select 1 from public.sensor_readings where id = foreign_insert_id
  ) then
    raise exception 'Cliente A inserted a reading for Cliente B.';
  end if;

  denied := false;
  affected := 0;
  begin
    update public.alerts
    set alert_status = 'ACKNOWLEDGED', acknowledged_at = now(),
        acknowledged_by = auth.uid()
    where device_id = 'STS-TEST-B';
    get diagnostics affected = row_count;
  exception when others then
    denied := true;
  end;
  if not denied and affected <> 0 then
    raise exception 'Cliente A acknowledged an alert for Cliente B.';
  end if;

  denied := false;
  begin
    perform public.sts_set_device_maintenance(
      'STS-TEST-B', 30, 'Cross tenant denial test', 'api'
    );
  exception when others then
    denied := true;
  end;
  if not denied then raise exception 'Cliente A activated maintenance for Cliente B.'; end if;

  perform public.sts_set_device_maintenance(
    'STS-TEST-A', 30, 'Authorized tenant test', 'api'
  );
  if not exists (
    select 1 from public.maintenance_sessions
    where device_id = current_setting('sts_test.device_a')::uuid
      and maintenance_state = 'ACTIVE'
  ) then
    raise exception 'Authorized maintenance RPC did not persist session.';
  end if;
  if not exists (
    select 1 from public.events
    where device_id = current_setting('sts_test.device_a')::uuid
      and event_type = 'maintenance_started'
  ) or not exists (
    select 1 from public.audit_logs
    where device_id = current_setting('sts_test.device_a')::uuid
      and action = 'maintenance.start'
  ) then
    raise exception 'Maintenance RPC did not persist event and audit evidence.';
  end if;

  denied := false;
  begin
    perform public.sts_transition_device_lifecycle(
      'STS-TEST-B', 'ONBOARDING', 'Cross tenant denial test', 'api', false, 'rls-test'
    );
  exception when others then
    denied := true;
  end;
  if not denied then raise exception 'Cliente A changed Cliente B lifecycle.'; end if;

  perform public.sts_transition_device_lifecycle(
    'STS-TEST-A', 'ONBOARDING', 'Authorized tenant test', 'api', false, 'rls-test'
  );
  if not exists (
    select 1 from public.device_lifecycle_events
    where device_id = current_setting('sts_test.device_a')::uuid
      and to_state = 'ONBOARDING'
      and correlation_id = 'rls-test'
  ) then
    raise exception 'Authorized lifecycle RPC did not persist event.';
  end if;
  if not exists (
    select 1 from public.events
    where device_id = current_setting('sts_test.device_a')::uuid
      and event_type = 'device_lifecycle_changed'
      and correlation_id = 'rls-test'
  ) or not exists (
    select 1 from public.audit_logs
    where device_id = current_setting('sts_test.device_a')::uuid
      and action = 'device.lifecycle.transition'
      and correlation_id = 'rls-test'
  ) then
    raise exception 'Lifecycle RPC did not correlate event and audit evidence.';
  end if;

  denied := false;
  affected := 0;
  begin
    delete from public.sites
    where id = current_setting('sts_test.site_b')::uuid;
    get diagnostics affected = row_count;
  exception when others then
    denied := true;
  end;
  if not denied and affected <> 0 then raise exception 'Cliente A deleted Cliente B site.'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('sts_test.user_b'), true);

do $$
declare
  leaked_a integer;
  leaked_health integer;
  leaked_audit integer;
  leaked_alerts integer;
begin
  select count(*) into leaked_a
  from public.sensor_readings_context
  where client_id = current_setting('sts_test.client_a')::uuid;
  if leaked_a <> 0 then
    raise exception 'RLS failure: Cliente B can read % rows from Cliente A', leaked_a;
  end if;
  select count(*) into leaked_health
  from public.component_health_events che
  join public.device_components dc on dc.id = che.component_id
  where dc.device_id = current_setting('sts_test.device_a')::uuid;
  select count(*) into leaked_audit from public.audit_logs
  where client_id = current_setting('sts_test.client_a')::uuid;
  select count(*) into leaked_alerts from public.alerts where device_id = 'STS-TEST-A';
  if leaked_health <> 0 or leaked_audit <> 0 or leaked_alerts <> 0 then
    raise exception 'Cliente B indirect leak: health %, audit %, alerts %',
      leaked_health, leaked_audit, leaked_alerts;
  end if;
end $$;

reset role;
rollback;
