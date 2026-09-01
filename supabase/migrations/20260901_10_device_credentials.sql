-- Activate the device credential foundation introduced by migration 05.
-- Plaintext device tokens are never stored; secret_hash contains a SHA-256 digest.

create unique index if not exists device_credentials_secret_hash_uidx
  on public.device_credentials(secret_hash);

create index if not exists device_credentials_device_status_idx
  on public.device_credentials(device_id, status, expires_at);

alter table public.device_credentials enable row level security;
revoke all on public.device_credentials from anon, authenticated;

create or replace function public.sts_audit_device_credential_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_action text;
begin
  if tg_op = 'INSERT' then
    event_action := 'device_credential.created';
  elsif old.status is distinct from new.status and new.status = 'revoked' then
    event_action := 'device_credential.revoked';
  else
    return new;
  end if;

  insert into public.audit_logs (
    actor_type, actor_reference, action, target_type, target_id,
    device_id, source, result, metadata
  ) values (
    'service', 'staging_device_credential_manager', event_action,
    'device_credential', new.id::text, new.device_id,
    'backend', 'success', jsonb_build_object(
      'credential_prefix', new.credential_prefix,
      'status', new.status
    )
  );
  return new;
end;
$$;

revoke all on function public.sts_audit_device_credential_change() from public;

drop trigger if exists device_credentials_audit on public.device_credentials;
create trigger device_credentials_audit
after insert or update on public.device_credentials
for each row execute function public.sts_audit_device_credential_change();

comment on table public.device_credentials is
  'Server-only per-device credentials. secret_hash is SHA-256 of a random high-entropy token; plaintext is never stored.';
