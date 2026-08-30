-- Phase 3: extensible operational events and confirmed outcomes (ground truth).

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  site_id uuid references public.sites(id) on delete restrict,
  space_id uuid references public.spaces(id) on delete restrict,
  device_id uuid references public.devices(id) on delete restrict,
  sensor_id uuid references public.sensors(id) on delete restrict,
  event_type text not null,
  start_time timestamptz not null,
  end_time timestamptz,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  source text not null check (source in ('device', 'system', 'technician', 'client', 'ai')),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  confirmation_status text not null default 'unconfirmed'
    check (confirmation_status in ('unconfirmed', 'confirmed', 'rejected', 'false_alarm')),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or end_time >= start_time)
);

create table if not exists public.event_outcomes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  diagnosis_code text,
  diagnosis_description text,
  action_type text,
  action_description text,
  outcome_code text not null,
  outcome_description text,
  is_ground_truth boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now()
);

create or replace function public.sts_validate_event_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_device_id uuid;
  resolved_space_id uuid;
  resolved_site_id uuid;
  resolved_client_id uuid;
begin
  if new.sensor_id is not null then
    select s.device_id into resolved_device_id
    from public.sensors s where s.id = new.sensor_id;
    if resolved_device_id is null then
      raise exception 'Sensor de evento inválido.';
    end if;
    if new.device_id is not null and new.device_id <> resolved_device_id then
      raise exception 'O sensor não pertence ao dispositivo indicado.';
    end if;
    new.device_id := resolved_device_id;
  end if;

  if new.device_id is not null then
    select d.space_id into resolved_space_id
    from public.devices d where d.id = new.device_id;
    if resolved_space_id is null then
      raise exception 'O dispositivo deve estar associado a um espaço antes de receber eventos normalizados.';
    end if;
    if new.space_id is not null and new.space_id <> resolved_space_id then
      raise exception 'O dispositivo não pertence ao espaço indicado.';
    end if;
    new.space_id := resolved_space_id;
  end if;

  if new.space_id is not null then
    select sp.site_id into resolved_site_id
    from public.spaces sp where sp.id = new.space_id;
    if resolved_site_id is null then
      raise exception 'Espaço de evento inválido.';
    end if;
    if new.site_id is not null and new.site_id <> resolved_site_id then
      raise exception 'O espaço não pertence ao site indicado.';
    end if;
    new.site_id := resolved_site_id;
  end if;

  if new.site_id is not null then
    select si.client_id into resolved_client_id
    from public.sites si where si.id = new.site_id;
    if resolved_client_id is null then
      raise exception 'Site de evento inválido.';
    end if;
    if new.client_id is not null and new.client_id <> resolved_client_id then
      raise exception 'O site não pertence ao cliente indicado.';
    end if;
    new.client_id := resolved_client_id;
  end if;

  if new.client_id is null then
    raise exception 'client_id é obrigatório para isolamento multi-tenant.';
  end if;
  return new;
end;
$$;

drop trigger if exists events_validate_context on public.events;
create trigger events_validate_context
before insert or update of client_id, site_id, space_id, device_id, sensor_id
on public.events
for each row execute function public.sts_validate_event_context();

revoke all on function public.sts_validate_event_context() from public;

create index if not exists events_client_time_idx on public.events(client_id, start_time desc);
create index if not exists events_site_time_idx on public.events(site_id, start_time desc) where site_id is not null;
create index if not exists events_space_time_idx on public.events(space_id, start_time desc) where space_id is not null;
create index if not exists events_device_type_time_idx on public.events(device_id, event_type, start_time desc) where device_id is not null;
create index if not exists events_sensor_time_idx on public.events(sensor_id, start_time desc) where sensor_id is not null;
create index if not exists events_confirmed_type_idx on public.events(event_type, start_time desc)
  where confirmation_status = 'confirmed';
create index if not exists event_outcomes_ground_truth_idx on public.event_outcomes(event_id)
  where is_ground_truth;

create or replace view public.ground_truth_context
with (security_invoker = true)
as
select
  e.id as event_id,
  e.event_type,
  e.start_time,
  e.end_time,
  e.severity,
  e.source,
  e.confirmation_status,
  e.client_id,
  e.site_id,
  e.space_id,
  e.device_id,
  e.sensor_id,
  eo.id as outcome_id,
  eo.diagnosis_code,
  eo.diagnosis_description,
  eo.action_type,
  eo.action_description,
  eo.outcome_code,
  eo.outcome_description,
  eo.is_ground_truth,
  eo.recorded_at
from public.events e
join public.event_outcomes eo on eo.event_id = e.id;

grant select on public.ground_truth_context to authenticated;

comment on table public.event_outcomes is 'Diagnóstico, ação e resultado real ligados ao evento; fonte de ground truth para aprendizagem futura.';
