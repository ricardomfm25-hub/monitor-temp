alter table public.readings
  add column if not exists telemetry_seq bigint,
  add column if not exists sample_age_s integer,
  add column if not exists sample_epoch bigint,
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists offline_captured boolean not null default false;

create index if not exists readings_device_offline_captured_created_idx
  on public.readings (device_id, offline_captured, created_at desc);
