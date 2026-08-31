-- STS Global Foundation v1: data-integrity contracts and administrative
-- device lifecycle. Additive; legacy Cold tables and columns remain operational.

create table if not exists public.actuators (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete restrict,
  actuator_key text not null,
  actuator_type text not null,
  name text not null,
  unit text,
  command_capabilities jsonb not null default '{}'::jsonb,
  safety_metadata jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, actuator_key)
);

alter table public.devices
  add column if not exists lifecycle_state text not null default 'PROVISIONED',
  add column if not exists lifecycle_changed_at timestamptz not null default now(),
  add column if not exists lifecycle_reason text,
  add column if not exists lifecycle_source text;

alter table public.devices drop constraint if exists devices_lifecycle_state_check;
alter table public.devices add constraint devices_lifecycle_state_check
  check (lifecycle_state in ('PROVISIONED','ONBOARDING','ACTIVE','SUSPENDED','RETIRED'));

create table if not exists public.device_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete restrict,
  from_state text not null check (from_state in ('PROVISIONED','ONBOARDING','ACTIVE','SUSPENDED','RETIRED')),
  to_state text not null check (to_state in ('PROVISIONED','ONBOARDING','ACTIVE','SUSPENDED','RETIRED')),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  source text not null check (source in ('dashboard','api','system','migration')),
  actor_user_id uuid references auth.users(id) on delete set null,
  administrative_restore boolean not null default false,
  correlation_id text,
  event_id uuid references public.events(id) on delete set null,
  audit_log_id uuid references public.audit_logs(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (from_state <> to_state)
);

alter table public.ingestion_batches
  add column if not exists idempotency_key text,
  add column if not exists delivery_class text not null default 'original',
  add column if not exists schema_version integer not null default 1;

alter table public.ingestion_batches
  drop constraint if exists ingestion_batches_delivery_class_check;
alter table public.ingestion_batches
  add constraint ingestion_batches_delivery_class_check
  check (delivery_class in ('original','delayed','retransmitted'));
alter table public.ingestion_batches
  drop constraint if exists ingestion_batches_schema_version_check;
alter table public.ingestion_batches
  add constraint ingestion_batches_schema_version_check check (schema_version >= 1);

create unique index if not exists ingestion_batches_device_idempotency_uidx
  on public.ingestion_batches(device_id, idempotency_key)
  where idempotency_key is not null;

-- Preserve the Legacy Cold write while giving new rows the same logical
-- identity as their Core envelope. Historical rows remain untouched/null.
alter table public.readings
  add column if not exists idempotency_key text;
create unique index if not exists readings_device_idempotency_uidx
  on public.readings(device_id, idempotency_key)
  where idempotency_key is not null;

alter table public.sensor_readings
  add column if not exists confidence text not null default 'UNKNOWN',
  add column if not exists quality_reason_codes text[] not null default '{}'::text[],
  add column if not exists source text not null default 'device',
  add column if not exists schema_version integer not null default 1;

alter table public.sensor_readings drop constraint if exists sensor_readings_quality_check;
alter table public.sensor_readings add constraint sensor_readings_quality_check
  check (quality in ('valid','suspect','invalid','missing','estimated','unknown'));
alter table public.sensor_readings drop constraint if exists sensor_readings_confidence_check;
alter table public.sensor_readings add constraint sensor_readings_confidence_check
  check (confidence in ('CONFIRMED','OBSERVED','INFERRED','UNKNOWN'));
alter table public.sensor_readings drop constraint if exists sensor_readings_source_check;
alter table public.sensor_readings add constraint sensor_readings_source_check
  check (source in ('device','backend','import','derived'));
alter table public.sensor_readings drop constraint if exists sensor_readings_schema_version_check;
alter table public.sensor_readings add constraint sensor_readings_schema_version_check
  check (schema_version >= 1);
-- The original constraint required exactly one value even when quality was
-- `missing`. Foundation v1 permits a value-less row only for explicit missing data.
alter table public.sensor_readings drop constraint if exists sensor_readings_check;
alter table public.sensor_readings drop constraint if exists sensor_readings_value_presence_check;
alter table public.sensor_readings add constraint sensor_readings_value_presence_check
  check (
    (quality = 'missing' and num_nonnulls(value_numeric, value_boolean, value_text) = 0)
    or
    (quality <> 'missing' and num_nonnulls(value_numeric, value_boolean, value_text) = 1)
  );

alter table public.events
  add column if not exists idempotency_key text,
  add column if not exists correlation_id text,
  add column if not exists schema_version integer not null default 1;
create unique index if not exists events_device_idempotency_uidx
  on public.events(device_id, idempotency_key)
  where device_id is not null and idempotency_key is not null;

-- The legacy alerts table remains the compatibility store. These nullable fields
-- formalize alert lifecycle without rewriting historical event rows.
-- Operational alerts such as offline/boot failures may not have an associated
-- measurement. Existing numeric values remain unchanged; only the invalid
-- requirement to invent temperature/humidity for non-metric alerts is removed.
alter table public.alerts
  alter column temperature drop not null,
  alter column humidity drop not null;

alter table public.alerts
  add column if not exists alert_status text,
  add column if not exists source_event_id uuid references public.events(id) on delete set null,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references auth.users(id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists correlation_id text;
alter table public.alerts drop constraint if exists alerts_alert_status_check;
alter table public.alerts add constraint alerts_alert_status_check
  check (alert_status is null or alert_status in ('OPEN','ACKNOWLEDGED','RESOLVED'));

alter table public.audit_logs
  add column if not exists reason text,
  add column if not exists correlation_id text;

alter table public.audit_logs drop constraint if exists audit_logs_actor_type_check;
alter table public.audit_logs add constraint audit_logs_actor_type_check
  check (actor_type in ('user','device','system','service','api','admin'));

create index if not exists actuators_device_active_idx on public.actuators(device_id, active);
create index if not exists device_lifecycle_events_device_time_idx
  on public.device_lifecycle_events(device_id, occurred_at desc);
create index if not exists devices_lifecycle_idx on public.devices(lifecycle_state, lifecycle_changed_at desc);
create index if not exists alerts_status_device_idx
  on public.alerts(device_id, alert_status) where alert_status is not null;
create index if not exists audit_logs_correlation_idx
  on public.audit_logs(correlation_id) where correlation_id is not null;

drop trigger if exists device_lifecycle_events_append_only on public.device_lifecycle_events;
create trigger device_lifecycle_events_append_only
before update or delete on public.device_lifecycle_events
for each row execute function public.sts_protect_raw_data();

alter table public.actuators enable row level security;
alter table public.device_lifecycle_events enable row level security;
revoke all on public.actuators, public.device_lifecycle_events from anon, authenticated;
grant select on public.actuators, public.device_lifecycle_events to authenticated;

drop policy if exists actuators_device_read on public.actuators;
create policy actuators_device_read on public.actuators for select to authenticated
  using (public.sts_can_access_device_uuid(device_id));

drop policy if exists actuators_admin_write on public.actuators;
create policy actuators_admin_write on public.actuators for all to authenticated
  using (public.sts_is_admin()) with check (public.sts_is_admin());

drop policy if exists lifecycle_events_device_read on public.device_lifecycle_events;
create policy lifecycle_events_device_read on public.device_lifecycle_events
  for select to authenticated using (public.sts_can_access_device_uuid(device_id));

create or replace function public.sts_transition_device_lifecycle(
  p_device_code text,
  p_to_state text,
  p_reason text,
  p_source text default 'dashboard',
  p_administrative_restore boolean default false,
  p_correlation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_device record;
  current_state text;
  next_state text := upper(btrim(coalesce(p_to_state, '')));
  normalized_reason text := btrim(coalesce(p_reason, ''));
  allowed boolean := false;
  change_time timestamptz := now();
  normalized_event_id uuid;
  audit_id uuid;
  lifecycle_id uuid;
begin
  if current_user_id is null then raise exception 'Não autenticado.'; end if;
  if next_state not in ('PROVISIONED','ONBOARDING','ACTIVE','SUSPENDED','RETIRED') then
    raise exception 'Lifecycle state inválido.';
  end if;
  if length(normalized_reason) < 3 or length(normalized_reason) > 500 then
    raise exception 'O motivo deve ter entre 3 e 500 caracteres.';
  end if;
  if p_source not in ('dashboard','api','system','migration') then
    raise exception 'Origem de lifecycle inválida.';
  end if;

  select d.id, d.device_id, d.lifecycle_state, d.space_id,
         sp.site_id, si.client_id
  into target_device
  from public.devices d
  left join public.spaces sp on sp.id = d.space_id
  left join public.sites si on si.id = sp.site_id
  where d.device_id = p_device_code
  for update of d;
  if not found then raise exception 'Dispositivo não encontrado.'; end if;

  if not (
    public.sts_is_admin()
    or (target_device.client_id is not null and public.sts_can_manage_client(target_device.client_id))
    or exists (
      select 1 from public.device_access da
      where da.user_id = current_user_id
        and da.device_id = target_device.device_id
        and coalesce(da.can_edit, false)
    )
  ) then
    raise exception 'Sem permissão para alterar este dispositivo.';
  end if;

  current_state := coalesce(target_device.lifecycle_state, 'PROVISIONED');
  if current_state = next_state then raise exception 'O dispositivo já está nesse lifecycle state.'; end if;
  allowed :=
    (current_state = 'PROVISIONED' and next_state in ('ONBOARDING','SUSPENDED','RETIRED'))
    or (current_state = 'ONBOARDING' and next_state in ('ACTIVE','SUSPENDED','RETIRED'))
    or (current_state = 'ACTIVE' and next_state in ('SUSPENDED','RETIRED'))
    or (current_state = 'SUSPENDED' and next_state in ('ONBOARDING','ACTIVE','RETIRED'))
    or (
      current_state = 'RETIRED'
      and next_state = 'ONBOARDING'
      and p_administrative_restore
      and public.sts_is_admin()
    );
  if not allowed then raise exception 'Transição de lifecycle não permitida.'; end if;

  update public.devices
  set lifecycle_state = next_state,
      lifecycle_changed_at = change_time,
      lifecycle_reason = normalized_reason,
      lifecycle_source = p_source,
      updated_at = change_time
  where id = target_device.id;

  if target_device.client_id is not null then
    insert into public.events (
      client_id, site_id, space_id, device_id, event_type, start_time,
      severity, source, description, metadata, created_by,
      correlation_id, schema_version
    ) values (
      target_device.client_id, target_device.site_id, target_device.space_id,
      target_device.id, 'device_lifecycle_changed', change_time,
      'info', 'technician', normalized_reason,
      jsonb_build_object('from_state', current_state, 'to_state', next_state),
      current_user_id, p_correlation_id, 1
    ) returning id into normalized_event_id;
  end if;

  insert into public.audit_logs (
    client_id, actor_user_id, actor_type, action, target_type, target_id,
    device_id, source, result, before_summary, after_summary, reason,
    correlation_id, occurred_at
  ) values (
    target_device.client_id, current_user_id, 'user', 'device.lifecycle.transition',
    'device', target_device.device_id, target_device.id, p_source, 'success',
    jsonb_build_object('lifecycle_state', current_state),
    jsonb_build_object('lifecycle_state', next_state), normalized_reason,
    p_correlation_id, change_time
  ) returning id into audit_id;

  insert into public.device_lifecycle_events (
    device_id, from_state, to_state, reason, source, actor_user_id,
    administrative_restore, correlation_id, event_id, audit_log_id, occurred_at
  ) values (
    target_device.id, current_state, next_state, normalized_reason, p_source,
    current_user_id, p_administrative_restore, p_correlation_id,
    normalized_event_id, audit_id, change_time
  ) returning id into lifecycle_id;

  return jsonb_build_object(
    'device_id', target_device.device_id,
    'from_state', current_state,
    'to_state', next_state,
    'lifecycle_event_id', lifecycle_id,
    'event_id', normalized_event_id,
    'audit_log_id', audit_id,
    'changed_at', change_time
  );
end;
$$;

revoke all on function public.sts_transition_device_lifecycle(text,text,text,text,boolean,text)
  from public, anon;
grant execute on function public.sts_transition_device_lifecycle(text,text,text,text,boolean,text)
  to authenticated;

comment on column public.ingestion_batches.recorded_at is
  'event_time: instante da medição no dispositivo, incluindo backlog offline.';
comment on column public.ingestion_batches.received_at is
  'ingested_at: instante em que o backend recebeu o envelope.';
comment on table public.sensor_readings is
  'Contrato global de measurements; contexto via sensor->device->space->site->client.';
comment on table public.device_lifecycle_events is
  'Lifecycle administrativo append-only, separado de saúde, comunicação e manutenção.';
comment on column public.alerts.alert_status is
  'Lifecycle do alerta: OPEN, ACKNOWLEDGED ou RESOLVED; null preserva histórico legacy.';
