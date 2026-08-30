-- Phase 5: tenant isolation and future per-device credentials.
-- The Node backend uses service_role and therefore bypasses RLS for ingestion.

create or replace function public.sts_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active = true
      and role in ('admin', 'super_admin')
  );
$$;

create or replace function public.sts_can_access_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.sts_is_admin() or exists (
    select 1 from public.client_users cu
    where cu.client_id = p_client_id
      and cu.user_id = auth.uid()
      and cu.active
  );
$$;

create or replace function public.sts_can_manage_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.sts_is_admin() or exists (
    select 1 from public.client_users cu
    where cu.client_id = p_client_id
      and cu.user_id = auth.uid()
      and cu.active
      and cu.role in ('owner', 'admin')
  );
$$;

create or replace function public.sts_can_access_device_uuid(p_device_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.sts_is_admin()
    or exists (
      select 1
      from public.devices d
      join public.spaces sp on sp.id = d.space_id
      join public.sites si on si.id = sp.site_id
      join public.client_users cu on cu.client_id = si.client_id
      where d.id = p_device_id
        and cu.user_id = auth.uid()
        and cu.active
    )
    or exists (
      select 1
      from public.devices d
      join public.device_access da on da.device_id = d.device_id
      where d.id = p_device_id
        and da.user_id = auth.uid()
        and coalesce(da.can_view, true)
    );
$$;

create or replace function public.sts_can_access_device_code(p_device_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.devices d
    where d.device_id = p_device_code
      and public.sts_can_access_device_uuid(d.id)
  );
$$;

revoke all on function public.sts_is_admin() from public;
revoke all on function public.sts_can_access_client(uuid) from public;
revoke all on function public.sts_can_manage_client(uuid) from public;
revoke all on function public.sts_can_access_device_uuid(uuid) from public;
revoke all on function public.sts_can_access_device_code(text) from public;
grant execute on function public.sts_is_admin() to authenticated;
grant execute on function public.sts_can_access_client(uuid) to authenticated;
grant execute on function public.sts_can_manage_client(uuid) to authenticated;
grant execute on function public.sts_can_access_device_uuid(uuid) to authenticated;
grant execute on function public.sts_can_access_device_code(text) to authenticated;

create table if not exists public.device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete restrict,
  credential_prefix text not null,
  secret_hash text not null,
  status text not null default 'active' check (status in ('pending', 'active', 'revoked', 'expired')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  rotated_from_id uuid references public.device_credentials(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  unique (credential_prefix)
);

create unique index if not exists device_credentials_one_active_uidx
  on public.device_credentials(device_id) where status = 'active';

-- Never expose credential hashes to normal dashboard users.
alter table public.device_credentials enable row level security;
revoke all on public.device_credentials from anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'products','product_models','clients','client_users','sites','spaces','sensors',
    'device_configurations','sensor_calibrations','ingestion_batches','sensor_readings',
    'events','event_outcomes','algorithm_versions','derived_features','baselines','learned_patterns'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
  end loop;
end $$;

grant insert, update on public.clients, public.client_users, public.sites, public.spaces,
  public.events, public.event_outcomes to authenticated;

drop policy if exists products_read on public.products;
create policy products_read on public.products for select to authenticated using (active or public.sts_is_admin());
drop policy if exists product_models_read on public.product_models;
create policy product_models_read on public.product_models for select to authenticated using (active or public.sts_is_admin());
drop policy if exists algorithms_read on public.algorithm_versions;
create policy algorithms_read on public.algorithm_versions for select to authenticated using (active or public.sts_is_admin());

drop policy if exists clients_tenant_read on public.clients;
create policy clients_tenant_read on public.clients for select to authenticated
  using (public.sts_can_access_client(id));
drop policy if exists clients_tenant_insert on public.clients;
create policy clients_tenant_insert on public.clients for insert to authenticated
  with check (public.sts_is_admin());
drop policy if exists clients_tenant_update on public.clients;
create policy clients_tenant_update on public.clients for update to authenticated
  using (public.sts_can_manage_client(id)) with check (public.sts_can_manage_client(id));

drop policy if exists client_users_tenant_read on public.client_users;
create policy client_users_tenant_read on public.client_users for select to authenticated
  using (user_id = auth.uid() or public.sts_can_manage_client(client_id));
drop policy if exists client_users_tenant_insert on public.client_users;
create policy client_users_tenant_insert on public.client_users for insert to authenticated
  with check (public.sts_can_manage_client(client_id));
drop policy if exists client_users_tenant_update on public.client_users;
create policy client_users_tenant_update on public.client_users for update to authenticated
  using (public.sts_can_manage_client(client_id)) with check (public.sts_can_manage_client(client_id));

drop policy if exists sites_tenant_read on public.sites;
create policy sites_tenant_read on public.sites for select to authenticated
  using (public.sts_can_access_client(client_id));
drop policy if exists sites_tenant_write on public.sites;
create policy sites_tenant_write on public.sites for all to authenticated
  using (public.sts_can_manage_client(client_id)) with check (public.sts_can_manage_client(client_id));

drop policy if exists spaces_tenant_read on public.spaces;
create policy spaces_tenant_read on public.spaces for select to authenticated
  using (exists (select 1 from public.sites s where s.id = site_id and public.sts_can_access_client(s.client_id)));
drop policy if exists spaces_tenant_write on public.spaces;
create policy spaces_tenant_write on public.spaces for all to authenticated
  using (exists (select 1 from public.sites s where s.id = site_id and public.sts_can_manage_client(s.client_id)))
  with check (exists (select 1 from public.sites s where s.id = site_id and public.sts_can_manage_client(s.client_id)));

drop policy if exists sensors_device_read on public.sensors;
create policy sensors_device_read on public.sensors for select to authenticated
  using (public.sts_can_access_device_uuid(device_id));
drop policy if exists device_configurations_device_read on public.device_configurations;
create policy device_configurations_device_read on public.device_configurations for select to authenticated
  using (public.sts_can_access_device_uuid(device_id));
drop policy if exists sensor_calibrations_device_read on public.sensor_calibrations;
create policy sensor_calibrations_device_read on public.sensor_calibrations for select to authenticated
  using (exists (select 1 from public.sensors s where s.id = sensor_id and public.sts_can_access_device_uuid(s.device_id)));
drop policy if exists ingestion_batches_device_read on public.ingestion_batches;
create policy ingestion_batches_device_read on public.ingestion_batches for select to authenticated
  using (public.sts_can_access_device_uuid(device_id));
drop policy if exists sensor_readings_device_read on public.sensor_readings;
create policy sensor_readings_device_read on public.sensor_readings for select to authenticated
  using (exists (select 1 from public.sensors s where s.id = sensor_id and public.sts_can_access_device_uuid(s.device_id)));

drop policy if exists events_tenant_read on public.events;
create policy events_tenant_read on public.events for select to authenticated
  using (public.sts_can_access_client(client_id));
drop policy if exists events_tenant_insert on public.events;
create policy events_tenant_insert on public.events for insert to authenticated
  with check (public.sts_can_access_client(client_id) and (created_by is null or created_by = auth.uid() or public.sts_is_admin()));
drop policy if exists events_tenant_update on public.events;
create policy events_tenant_update on public.events for update to authenticated
  using (public.sts_can_manage_client(client_id)) with check (public.sts_can_manage_client(client_id));
drop policy if exists event_outcomes_tenant_read on public.event_outcomes;
create policy event_outcomes_tenant_read on public.event_outcomes for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and public.sts_can_access_client(e.client_id)));
drop policy if exists event_outcomes_tenant_insert on public.event_outcomes;
create policy event_outcomes_tenant_insert on public.event_outcomes for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and public.sts_can_access_client(e.client_id)));

drop policy if exists derived_features_tenant_read on public.derived_features;
create policy derived_features_tenant_read on public.derived_features for select to authenticated
  using (public.sts_can_access_client(client_id));
drop policy if exists baselines_tenant_read on public.baselines;
create policy baselines_tenant_read on public.baselines for select to authenticated
  using (public.sts_can_access_client(client_id));
drop policy if exists learned_patterns_scoped_read on public.learned_patterns;
create policy learned_patterns_scoped_read on public.learned_patterns for select to authenticated
  using (
    (scope_type = 'GLOBAL' and privacy_class in ('aggregated','anonymized','transferable'))
    or (client_id is not null and public.sts_can_access_client(client_id))
    or (scope_type in ('PRODUCT','MODEL') and privacy_class in ('aggregated','anonymized','transferable'))
    or public.sts_is_admin()
  );

-- Administrative writes for catalog, sensor registry and learned artifacts.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'products','product_models','sensors','device_configurations','sensor_calibrations',
    'algorithm_versions','derived_features','baselines','learned_patterns'
  ]
  loop
    execute format('grant insert, update on public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_admin_write', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.sts_is_admin()) with check (public.sts_is_admin())',
      table_name || '_admin_write', table_name
    );
  end loop;
end $$;

comment on table public.device_credentials is 'Hashes de credenciais individuais para ativação, rotação e revogação futuras; nunca guardar o segredo em claro.';

-- Harden the legacy dashboard tables. Restrictive guards are ANDed with any
-- pre-existing permissive policy, while the matching scoped permissive policy
-- keeps installations with no versioned base policy operational.
alter table public.profiles enable row level security;
alter table public.device_access enable row level security;
alter table public.devices enable row level security;
alter table public.readings enable row level security;
alter table public.alerts enable row level security;

drop policy if exists sts_profiles_scoped_read on public.profiles;
create policy sts_profiles_scoped_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.sts_is_admin());
drop policy if exists sts_profiles_tenant_guard on public.profiles;
create policy sts_profiles_tenant_guard on public.profiles as restrictive for select to authenticated
  using (id = auth.uid() or public.sts_is_admin());

drop policy if exists sts_device_access_scoped_read on public.device_access;
create policy sts_device_access_scoped_read on public.device_access for select to authenticated
  using (user_id = auth.uid() or public.sts_is_admin());
drop policy if exists sts_device_access_tenant_guard on public.device_access;
create policy sts_device_access_tenant_guard on public.device_access as restrictive for select to authenticated
  using (user_id = auth.uid() or public.sts_is_admin());

drop policy if exists sts_devices_scoped_read on public.devices;
create policy sts_devices_scoped_read on public.devices for select to authenticated
  using (public.sts_can_access_device_uuid(id));
drop policy if exists sts_devices_tenant_guard on public.devices;
create policy sts_devices_tenant_guard on public.devices as restrictive for select to authenticated
  using (public.sts_can_access_device_uuid(id));

drop policy if exists sts_readings_scoped_read on public.readings;
create policy sts_readings_scoped_read on public.readings for select to authenticated
  using (public.sts_can_access_device_code(device_id));
drop policy if exists sts_readings_tenant_guard on public.readings;
create policy sts_readings_tenant_guard on public.readings as restrictive for select to authenticated
  using (public.sts_can_access_device_code(device_id));

drop policy if exists sts_alerts_scoped_read on public.alerts;
create policy sts_alerts_scoped_read on public.alerts for select to authenticated
  using (public.sts_can_access_device_code(device_id));
drop policy if exists sts_alerts_tenant_guard on public.alerts;
create policy sts_alerts_tenant_guard on public.alerts as restrictive for select to authenticated
  using (public.sts_can_access_device_code(device_id));
