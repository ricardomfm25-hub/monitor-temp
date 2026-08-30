-- Phase 2: immutable raw ingestion batches and normalized time-series values.

create table if not exists public.device_configurations (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete restrict,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  firmware_version text,
  hardware_version text,
  config_version bigint,
  configuration jsonb not null default '{}'::jsonb,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create unique index if not exists device_configurations_one_current_uidx
  on public.device_configurations(device_id) where effective_to is null;
create index if not exists device_configurations_timeline_idx
  on public.device_configurations(device_id, effective_from desc);

create table if not exists public.sensor_calibrations (
  id uuid primary key default gen_random_uuid(),
  sensor_id uuid not null references public.sensors(id) on delete restrict,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  calibration jsonb not null,
  certificate_reference text,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create index if not exists sensor_calibrations_timeline_idx
  on public.sensor_calibrations(sensor_id, effective_from desc);

create table if not exists public.ingestion_batches (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete restrict,
  telemetry_seq bigint,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  device_configuration_id uuid references public.device_configurations(id) on delete set null,
  firmware_version text,
  transport text not null default 'https',
  raw_payload jsonb not null,
  payload_sha256 text,
  created_at timestamptz not null default now(),
  unique (device_id, telemetry_seq)
);

create index if not exists ingestion_batches_device_recorded_idx
  on public.ingestion_batches(device_id, recorded_at desc);
create index if not exists ingestion_batches_received_idx
  on public.ingestion_batches(received_at desc);

create table if not exists public.sensor_readings (
  id uuid primary key default gen_random_uuid(),
  ingestion_batch_id uuid not null references public.ingestion_batches(id) on delete restrict,
  sensor_id uuid not null references public.sensors(id) on delete restrict,
  recorded_at timestamptz not null,
  value_numeric double precision,
  value_boolean boolean,
  value_text text,
  quality text not null default 'valid' check (quality in ('valid', 'suspect', 'invalid', 'missing', 'estimated')),
  status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (ingestion_batch_id, sensor_id),
  check (num_nonnulls(value_numeric, value_boolean, value_text) = 1)
);

create index if not exists sensor_readings_sensor_time_idx
  on public.sensor_readings(sensor_id, recorded_at desc);
create index if not exists sensor_readings_batch_idx
  on public.sensor_readings(ingestion_batch_id);

create or replace view public.sensor_readings_context
with (security_invoker = true)
as
select
  sr.id,
  sr.recorded_at,
  sr.value_numeric,
  sr.value_boolean,
  sr.value_text,
  sr.quality,
  sr.status,
  sr.sensor_id,
  s.sensor_key,
  s.sensor_type,
  s.name as sensor_name,
  s.unit,
  d.id as device_internal_id,
  d.device_id as device_code,
  d.space_id,
  sp.site_id,
  si.client_id,
  d.product_model_id,
  pm.product_id,
  sr.ingestion_batch_id,
  ib.device_configuration_id,
  ib.firmware_version,
  ib.received_at
from public.sensor_readings sr
join public.sensors s on s.id = sr.sensor_id
join public.devices d on d.id = s.device_id
left join public.spaces sp on sp.id = d.space_id
left join public.sites si on si.id = sp.site_id
left join public.product_models pm on pm.id = d.product_model_id
join public.ingestion_batches ib on ib.id = sr.ingestion_batch_id;

grant select on public.sensor_readings_context to authenticated;

create or replace function public.sts_protect_raw_data()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('sts.allow_raw_mutation', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  raise exception '% is append-only; set sts.allow_raw_mutation=on only in an audited retention/privacy transaction.', tg_table_name;
end;
$$;

drop trigger if exists ingestion_batches_append_only on public.ingestion_batches;
create trigger ingestion_batches_append_only
before update or delete on public.ingestion_batches
for each row execute function public.sts_protect_raw_data();

drop trigger if exists sensor_readings_append_only on public.sensor_readings;
create trigger sensor_readings_append_only
before update or delete on public.sensor_readings
for each row execute function public.sts_protect_raw_data();

-- Raw tables are append-only through the normal authenticated API.
revoke update, delete, truncate on public.ingestion_batches from anon, authenticated;
revoke update, delete, truncate on public.sensor_readings from anon, authenticated;

comment on table public.ingestion_batches is 'Envelope bruto imutável recebido do dispositivo; permite reprocessamento futuro.';
comment on table public.sensor_readings is 'Valores normalizados por sensor; nunca substituem o payload bruto.';
comment on view public.sensor_readings_context is 'Vista segura para consultas por sensor, device, space, site, client, modelo e produto.';
