alter table public.readings
  add column if not exists exterior_temperature numeric,
  add column if not exists exterior_humidity numeric,
  add column if not exists exterior_sensor_ok boolean;

comment on column public.readings.exterior_temperature is
  'Temperatura reportada pelo DHT22 exterior.';
comment on column public.readings.exterior_humidity is
  'Humidade reportada pelo DHT22 exterior.';
comment on column public.readings.exterior_sensor_ok is
  'Estado do DHT22 exterior no momento da amostra.';
