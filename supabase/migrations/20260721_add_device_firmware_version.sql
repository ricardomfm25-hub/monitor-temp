alter table public.devices
  add column if not exists firmware_version text;

comment on column public.devices.firmware_version is
  'Versao reportada pelo proprio dispositivo na telemetria mais recente.';

update public.devices
set firmware_version = coalesce(
  nullif(config ->> 'firmware_version', ''),
  nullif(config ->> 'fw_version', ''),
  nullif(config ->> 'firmware', '')
)
where firmware_version is null;
