-- STS data architecture, phase 1: normalized product and installation hierarchy.
-- Additive and backwards compatible with the current device_id based system.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,32}$'),
  name text not null,
  description text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_models (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  code text not null,
  name text not null,
  version text,
  capabilities jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, code)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,48}$'),
  name text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Legacy Cold already has `clients` with slug/is_active. CREATE TABLE IF NOT
-- EXISTS does not reconcile columns, so add and backfill the STS Core contract
-- without removing or renaming any legacy field.
alter table public.clients
  add column if not exists code text,
  add column if not exists active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.clients c
set code = left(
  upper(
    regexp_replace(
      coalesce(
        nullif(btrim(to_jsonb(c) ->> 'slug'), ''),
        'CLIENT_' || replace(id::text, '-', '')
      ),
      '[^A-Za-z0-9_-]+', '_', 'g'
    )
  ),
  48
)
where code is null;

update public.clients c
set active = case
      when to_jsonb(c) ? 'is_active'
        then coalesce((to_jsonb(c) ->> 'is_active')::boolean, true)
      else coalesce(active, true)
    end,
    updated_at = coalesce(updated_at, created_at, now());

alter table public.clients alter column code set not null;
alter table public.clients drop constraint if exists clients_code_check;
alter table public.clients add constraint clients_code_check
  check (code ~ '^[A-Z0-9_-]{3,48}$');
create unique index if not exists clients_code_uidx on public.clients(code);

create table if not exists public.client_users (
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  code text not null,
  name text not null,
  address jsonb not null default '{}'::jsonb,
  timezone text not null default 'Europe/Lisbon',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, code)
);

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete restrict,
  code text not null,
  name text not null,
  space_type text,
  description text,
  operational_metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, code)
);

alter table public.devices
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists product_model_id uuid references public.product_models(id) on delete restrict,
  add column if not exists space_id uuid references public.spaces(id) on delete restrict,
  add column if not exists hardware_version text,
  add column if not exists serial_number text,
  add column if not exists installation_date date,
  add column if not exists commissioned_at timestamptz,
  add column if not exists commissioning_metadata jsonb not null default '{}'::jsonb;

update public.devices set id = gen_random_uuid() where id is null;
alter table public.devices alter column id set default gen_random_uuid();
alter table public.devices alter column id set not null;
create unique index if not exists devices_internal_id_uidx on public.devices(id);
create unique index if not exists devices_serial_number_uidx
  on public.devices(serial_number) where serial_number is not null;
create index if not exists devices_product_model_idx on public.devices(product_model_id);
create index if not exists devices_space_idx on public.devices(space_id);

create table if not exists public.sensors (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete restrict,
  sensor_key text not null,
  sensor_type text not null,
  name text not null,
  unit text,
  location_context text,
  hardware_model text,
  calibration_metadata jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, sensor_key)
);

create index if not exists product_models_product_idx on public.product_models(product_id);
create index if not exists client_users_user_idx on public.client_users(user_id) where active;
create index if not exists sites_client_idx on public.sites(client_id);
create index if not exists spaces_site_idx on public.spaces(site_id);
create index if not exists sensors_device_active_idx on public.sensors(device_id, active);
create index if not exists sensors_type_idx on public.sensors(sensor_type);

insert into public.products (code, name, description)
values ('COLD', 'STS Cold', 'Monitorização e inteligência operacional de frio')
on conflict (code) do nothing;

insert into public.product_models (product_id, code, name, version, capabilities)
select id, 'COLD-LEGACY', 'Cold Legacy', '1',
       '{"temperature":true,"humidity":true,"legacy_compatible":true}'::jsonb
from public.products where code = 'COLD'
on conflict (product_id, code) do nothing;

update public.devices d
set product_model_id = pm.id
from public.product_models pm
join public.products p on p.id = pm.product_id
where d.product_model_id is null
  and p.code = 'COLD'
  and pm.code = 'COLD-LEGACY';

comment on column public.devices.id is 'UUID interno estável; device_id permanece como código público compatível com firmware.';
comment on column public.devices.space_id is 'Contexto organizacional resolvido no backend, nunca hardcoded no firmware.';
