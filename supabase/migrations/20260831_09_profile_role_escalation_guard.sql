-- Prevent authenticated users from changing their own authorization fields.
-- This migration is prepared for review and staging validation only.
-- Do not apply to production as part of hardware integration validation.

create or replace function public.sts_protect_profile_authorization_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not public.sts_is_admin() then
    if new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.client_id is distinct from old.client_id
      or new.email is distinct from old.email then
      raise exception 'profile authorization fields require an administrator'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sts_protect_profile_authorization_fields() from public;

drop trigger if exists sts_protect_profile_authorization_fields on public.profiles;
create trigger sts_protect_profile_authorization_fields
before update on public.profiles
for each row execute function public.sts_protect_profile_authorization_fields();
