alter table public.readings
  add column if not exists wifi_rssi integer,
  add column if not exists post_ok_count bigint,
  add column if not exists post_fail_count bigint,
  add column if not exists buffer_count integer,
  add column if not exists wifi_reconnect_count bigint,
  add column if not exists last_http_status integer;

create index if not exists readings_device_wifi_created_idx
  on public.readings (device_id, created_at desc)
  where wifi_rssi is not null;

comment on column public.readings.wifi_rssi is
  'RSSI Wi-Fi em dBm reportado pelo dispositivo no momento da telemetria.';
