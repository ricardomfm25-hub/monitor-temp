-- Phase 4: traceable algorithms, features, baselines and learned knowledge.

create table if not exists public.algorithm_versions (
  id uuid primary key default gen_random_uuid(),
  algorithm_key text not null,
  version text not null,
  purpose text not null,
  implementation_reference text,
  parameters_schema jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (algorithm_key, version)
);

create table if not exists public.derived_features (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  sensor_id uuid references public.sensors(id) on delete restrict,
  device_id uuid references public.devices(id) on delete restrict,
  space_id uuid references public.spaces(id) on delete restrict,
  feature_key text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  value_numeric double precision,
  value_json jsonb,
  quality text not null default 'valid',
  algorithm_version_id uuid not null references public.algorithm_versions(id) on delete restrict,
  calculated_at timestamptz not null default now(),
  source_metadata jsonb not null default '{}'::jsonb,
  check (window_end > window_start),
  check (num_nonnulls(value_numeric, value_json) = 1),
  check (num_nonnulls(sensor_id, device_id, space_id) >= 1)
);

create table if not exists public.baselines (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  scope_type text not null check (scope_type in ('SPACE', 'DEVICE', 'SENSOR')),
  space_id uuid references public.spaces(id) on delete restrict,
  device_id uuid references public.devices(id) on delete restrict,
  sensor_id uuid references public.sensors(id) on delete restrict,
  metric text not null,
  window_definition jsonb not null,
  distribution jsonb not null,
  confidence double precision check (confidence between 0 and 1),
  algorithm_version_id uuid not null references public.algorithm_versions(id) on delete restrict,
  training_period_start timestamptz not null,
  training_period_end timestamptz not null,
  sample_count bigint not null check (sample_count >= 0),
  calculated_at timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (training_period_end > training_period_start),
  check (
    (scope_type = 'SPACE' and space_id is not null and device_id is null and sensor_id is null) or
    (scope_type = 'DEVICE' and space_id is null and device_id is not null and sensor_id is null) or
    (scope_type = 'SENSOR' and space_id is null and device_id is null and sensor_id is not null)
  )
);

create table if not exists public.learned_patterns (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('GLOBAL', 'PRODUCT', 'MODEL', 'CLIENT', 'SPACE', 'DEVICE')),
  product_id uuid references public.products(id) on delete restrict,
  product_model_id uuid references public.product_models(id) on delete restrict,
  client_id uuid references public.clients(id) on delete restrict,
  space_id uuid references public.spaces(id) on delete restrict,
  device_id uuid references public.devices(id) on delete restrict,
  pattern_type text not null,
  description text,
  parameters jsonb not null,
  confidence double precision check (confidence between 0 and 1),
  algorithm_version_id uuid not null references public.algorithm_versions(id) on delete restrict,
  training_period_start timestamptz not null,
  training_period_end timestamptz not null,
  sample_count bigint not null check (sample_count >= 0),
  privacy_class text not null default 'private'
    check (privacy_class in ('private', 'aggregated', 'anonymized', 'transferable')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (training_period_end > training_period_start),
  check (
    (scope_type = 'GLOBAL' and product_id is null and product_model_id is null and client_id is null and space_id is null and device_id is null and privacy_class in ('aggregated','anonymized','transferable')) or
    (scope_type = 'PRODUCT' and product_id is not null and product_model_id is null and client_id is null and space_id is null and device_id is null) or
    (scope_type = 'MODEL' and product_id is null and product_model_id is not null and client_id is null and space_id is null and device_id is null) or
    (scope_type = 'CLIENT' and product_id is null and product_model_id is null and client_id is not null and space_id is null and device_id is null) or
    (scope_type = 'SPACE' and product_id is null and product_model_id is null and client_id is not null and space_id is not null and device_id is null) or
    (scope_type = 'DEVICE' and product_id is null and product_model_id is null and client_id is not null and space_id is null and device_id is not null)
  )
);

create index if not exists derived_features_sensor_key_time_idx on public.derived_features(sensor_id, feature_key, window_start desc);
create index if not exists derived_features_device_key_time_idx on public.derived_features(device_id, feature_key, window_start desc);
create index if not exists baselines_client_scope_metric_idx on public.baselines(client_id, scope_type, metric) where active;
create index if not exists learned_patterns_scope_type_idx on public.learned_patterns(scope_type, pattern_type) where active;
create index if not exists learned_patterns_client_idx on public.learned_patterns(client_id) where client_id is not null and active;
