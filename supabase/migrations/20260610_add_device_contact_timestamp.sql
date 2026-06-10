alter table public.devices
  add column if not exists last_contact_at timestamptz;

create index if not exists devices_last_contact_at_idx
  on public.devices (last_contact_at desc);
