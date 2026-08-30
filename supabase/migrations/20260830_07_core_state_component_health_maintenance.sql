-- STS Global Foundation v1: additive Core state, Component Health,
-- Maintenance lifecycle and audit foundations.
-- This migration does not replace legacy devices.config or hardware_diagnostics.

create table if not exists public.device_components (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete restrict,
  component_key text not null,
  component_type text not null,
  name text not null,
  diagnostic_capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, component_key)
);

create table if not exists public.component_health_events (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.device_components(id) on delete restrict,
  health_state text not null check (health_state in ('HEALTHY','DEGRADED','FAULT','UNKNOWN')),
  diagnostic_confidence text not null default 'UNKNOWN'
    check (diagnostic_confidence in ('CONFIRMED','OBSERVED','INFERRED','UNKNOWN')),
  diagnostic_source text not null,
  diagnostic_scope text,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  last_seen timestamptz,
  last_success timestamptz,
  last_error timestamptz,
  error_count bigint not null default 0 check (error_count >= 0),
  consecutive_errors bigint not null default 0 check (consecutive_errors >= 0),
  diagnostic_information jsonb not null default '{}'::jsonb,
  ingestion_batch_id uuid references public.ingestion_batches(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete restrict,
  maintenance_state text not null default 'ACTIVE'
    check (maintenance_state in ('ACTIVE','INACTIVE')),
  started_at timestamptz not null,
  scheduled_end_at timestamptz,
  ended_at timestamptz,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  started_by uuid references auth.users(id) on delete set null,
  ended_by uuid references auth.users(id) on delete set null,
  source text not null check (source in ('dashboard','api','device','system','migration')),
  notification_policy jsonb not null default
    '{"suppress_process_alarms":true,"suppress_communication":false,"suppress_component_health":false}'::jsonb,
  start_event_id uuid references public.events(id) on delete set null,
  end_event_id uuid references public.events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end_at is null or scheduled_end_at > started_at),
  check (ended_at is null or ended_at >= started_at),
  check (
    (maintenance_state = 'ACTIVE' and ended_at is null)
    or (maintenance_state = 'INACTIVE' and ended_at is not null)
  )
);

create unique index if not exists maintenance_sessions_one_active_uidx
  on public.maintenance_sessions(device_id) where maintenance_state = 'ACTIVE';

create table if not exists public.device_state_snapshots (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete restrict,
  operational_state text not null check (operational_state in ('NORMAL','WARNING','CRITICAL','UNKNOWN')),
  component_health_state text not null check (component_health_state in ('HEALTHY','DEGRADED','FAULT','UNKNOWN')),
  communication_state text not null check (communication_state in ('ONLINE','DEGRADED','OFFLINE','UNKNOWN')),
  maintenance_state text not null check (maintenance_state in ('ACTIVE','INACTIVE')),
  observed_at timestamptz not null,
  source text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('user','device','system','service')),
  actor_reference text,
  action text not null,
  target_type text not null,
  target_id text,
  device_id uuid references public.devices(id) on delete restrict,
  request_id text,
  source text not null,
  result text not null check (result in ('success','denied','failed')),
  before_summary jsonb,
  after_summary jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists device_components_device_idx
  on public.device_components(device_id, active);
create index if not exists component_health_component_time_idx
  on public.component_health_events(component_id, observed_at desc);
create index if not exists maintenance_sessions_device_time_idx
  on public.maintenance_sessions(device_id, started_at desc);
create index if not exists device_state_snapshots_device_time_idx
  on public.device_state_snapshots(device_id, observed_at desc);
create index if not exists audit_logs_client_time_idx
  on public.audit_logs(client_id, occurred_at desc) where client_id is not null;
create index if not exists audit_logs_device_time_idx
  on public.audit_logs(device_id, occurred_at desc) where device_id is not null;
create index if not exists audit_logs_action_time_idx
  on public.audit_logs(action, occurred_at desc);

drop trigger if exists component_health_events_append_only on public.component_health_events;
create trigger component_health_events_append_only
before update or delete on public.component_health_events
for each row execute function public.sts_protect_raw_data();

drop trigger if exists device_state_snapshots_append_only on public.device_state_snapshots;
create trigger device_state_snapshots_append_only
before update or delete on public.device_state_snapshots
for each row execute function public.sts_protect_raw_data();

drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only
before update or delete on public.audit_logs
for each row execute function public.sts_protect_raw_data();

alter table public.device_components enable row level security;
alter table public.component_health_events enable row level security;
alter table public.maintenance_sessions enable row level security;
alter table public.device_state_snapshots enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.device_components, public.component_health_events,
  public.maintenance_sessions, public.device_state_snapshots, public.audit_logs
  from anon, authenticated;

grant select on public.device_components, public.component_health_events,
  public.maintenance_sessions, public.device_state_snapshots, public.audit_logs
  to authenticated;

drop policy if exists device_components_scoped_read on public.device_components;
create policy device_components_scoped_read on public.device_components
  for select to authenticated using (public.sts_can_access_device_uuid(device_id));

drop policy if exists component_health_scoped_read on public.component_health_events;
create policy component_health_scoped_read on public.component_health_events
  for select to authenticated using (
    exists (
      select 1 from public.device_components dc
      where dc.id = component_id
        and public.sts_can_access_device_uuid(dc.device_id)
    )
  );

drop policy if exists maintenance_sessions_scoped_read on public.maintenance_sessions;
create policy maintenance_sessions_scoped_read on public.maintenance_sessions
  for select to authenticated using (public.sts_can_access_device_uuid(device_id));

drop policy if exists device_state_snapshots_scoped_read on public.device_state_snapshots;
create policy device_state_snapshots_scoped_read on public.device_state_snapshots
  for select to authenticated using (public.sts_can_access_device_uuid(device_id));

drop policy if exists audit_logs_scoped_read on public.audit_logs;
create policy audit_logs_scoped_read on public.audit_logs
  for select to authenticated using (
    public.sts_is_admin()
    or (device_id is not null and public.sts_can_access_device_uuid(device_id))
    or (client_id is not null and public.sts_can_manage_client(client_id))
  );

create or replace function public.sts_set_device_maintenance(
  p_device_code text,
  p_duration_min integer,
  p_reason text,
  p_source text default 'dashboard'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_device record;
  active_session public.maintenance_sessions%rowtype;
  next_state text;
  change_time timestamptz := now();
  scheduled_end timestamptz;
  next_maintenance jsonb;
  normalized_reason text := btrim(coalesce(p_reason, ''));
  audit_id uuid;
  lifecycle_event_id uuid;
begin
  if current_user_id is null then
    raise exception 'Não autenticado.';
  end if;
  if p_duration_min is null or p_duration_min < 0 or p_duration_min > 10080 then
    raise exception 'Duração de manutenção inválida.';
  end if;
  if length(normalized_reason) < 3 or length(normalized_reason) > 500 then
    raise exception 'O motivo deve ter entre 3 e 500 caracteres.';
  end if;
  if p_source not in ('dashboard','api','device','system','migration') then
    raise exception 'Origem de manutenção inválida.';
  end if;

  select d.id, d.device_id, d.config, d.config_version,
         sp.id as space_id, si.id as site_id, si.client_id
  into target_device
  from public.devices d
  left join public.spaces sp on sp.id = d.space_id
  left join public.sites si on si.id = sp.site_id
  where d.device_id = p_device_code
  for update of d;

  if not found then
    raise exception 'Dispositivo não encontrado.';
  end if;
  if not (
    public.sts_is_admin()
    or (
      target_device.client_id is not null
      and public.sts_can_manage_client(target_device.client_id)
    )
    or exists (
      select 1 from public.device_access da
      where da.user_id = current_user_id
        and da.device_id = target_device.device_id
        and coalesce(da.can_edit, false)
    )
  ) then
    raise exception 'Sem permissão para alterar este dispositivo.';
  end if;

  select * into active_session
  from public.maintenance_sessions
  where device_id = target_device.id and maintenance_state = 'ACTIVE'
  for update;

  if p_duration_min > 0 then
    next_state := 'ACTIVE';
    scheduled_end := change_time + make_interval(mins => p_duration_min);
    if active_session.id is not null then
      update public.maintenance_sessions
      set maintenance_state = 'INACTIVE', ended_at = change_time,
          ended_by = current_user_id, updated_at = change_time,
          metadata = metadata || '{"end_reason":"superseded"}'::jsonb
      where id = active_session.id;
    end if;
    insert into public.maintenance_sessions (
      device_id, maintenance_state, started_at, scheduled_end_at, reason,
      started_by, source, notification_policy
    ) values (
      target_device.id, 'ACTIVE', change_time, scheduled_end, normalized_reason,
      current_user_id, p_source,
      '{"suppress_process_alarms":true,"suppress_communication":false,"suppress_component_health":false}'::jsonb
    ) returning * into active_session;
  else
    next_state := 'INACTIVE';
    if active_session.id is not null then
      update public.maintenance_sessions
      set maintenance_state = 'INACTIVE', ended_at = change_time,
          ended_by = current_user_id, updated_at = change_time
      where id = active_session.id
      returning * into active_session;
    end if;
  end if;

  next_maintenance := jsonb_build_object(
    'maintenance_state', next_state,
    'active_until', case when next_state = 'ACTIVE' then scheduled_end else null end,
    'started_at', case when next_state = 'ACTIVE' then change_time else active_session.started_at end,
    'ended_at', case when next_state = 'INACTIVE' then change_time else null end,
    'duration_min', case when next_state = 'ACTIVE' then p_duration_min else null end,
    'reason', normalized_reason,
    'started_by', case when next_state = 'ACTIVE' then current_user_id else active_session.started_by end,
    'ended_by', case when next_state = 'INACTIVE' then current_user_id else null end,
    'source', p_source,
    'notification_policy', jsonb_build_object(
      'suppress_process_alarms', true,
      'suppress_communication', false,
      'suppress_component_health', false
    )
  );

  update public.devices
  set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('maintenance', next_maintenance),
      config_version = coalesce(config_version, 0) + 1,
      updated_at = change_time
  where id = target_device.id;

  if target_device.client_id is not null then
    insert into public.events (
      client_id, site_id, space_id, device_id, event_type, start_time,
      severity, source, description, metadata, created_by
    ) values (
      target_device.client_id, target_device.site_id, target_device.space_id,
      target_device.id,
      case when next_state = 'ACTIVE' then 'maintenance_started' else 'maintenance_ended' end,
      change_time, 'info', 'technician', normalized_reason,
      jsonb_build_object('maintenance_state', next_state, 'source', p_source),
      current_user_id
    ) returning id into lifecycle_event_id;
  end if;

  insert into public.audit_logs (
    client_id, actor_user_id, actor_type, action, target_type, target_id,
    device_id, source, result, before_summary, after_summary, metadata
  ) values (
    target_device.client_id, current_user_id, 'user',
    case when next_state = 'ACTIVE' then 'maintenance.start' else 'maintenance.end' end,
    'device', target_device.device_id, target_device.id, p_source, 'success',
    coalesce(target_device.config -> 'maintenance', '{}'::jsonb), next_maintenance,
    jsonb_build_object('event_id', lifecycle_event_id)
  ) returning id into audit_id;

  if active_session.id is not null then
    update public.maintenance_sessions
    set start_event_id = case when next_state = 'ACTIVE' then lifecycle_event_id else start_event_id end,
        end_event_id = case when next_state = 'INACTIVE' then lifecycle_event_id else end_event_id end,
        updated_at = change_time
    where id = active_session.id;
  end if;

  return jsonb_build_object(
    'device_id', target_device.device_id,
    'maintenance', next_maintenance,
    'audit_event_id', audit_id,
    'lifecycle_event_id', lifecycle_event_id
  );
end;
$$;

revoke all on function public.sts_set_device_maintenance(text, integer, text, text)
  from public, anon;
grant execute on function public.sts_set_device_maintenance(text, integer, text, text)
  to authenticated;

comment on table public.device_components is
  'Registo genérico de componentes diagnosticáveis; não implica capacidade de autoteste.';
comment on table public.component_health_events is
  'Evidência append-only da saúde individual, sempre acompanhada por confiança e origem.';
comment on table public.maintenance_sessions is
  'Ciclo de vida formal da manutenção; não interrompe medição, heartbeat ou diagnóstico.';
comment on table public.device_state_snapshots is
  'Quatro dimensões independentes do estado global STS num instante.';
comment on table public.audit_logs is
  'Auditoria append-only de alterações administrativas, técnicas e de segurança.';
