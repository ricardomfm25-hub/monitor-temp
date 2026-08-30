-- Transactional pairing compatible with restrictive devices RLS.
-- Pairing codes are only resolved inside SECURITY DEFINER functions and are
-- invalidated after a successful claim.

create unique index if not exists devices_pairing_code_upper_uidx
  on public.devices (upper(pairing_code))
  where pairing_code is not null;

create or replace function public.preview_device_pairing(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text := upper(btrim(coalesce(p_code, '')));
  current_user_id uuid := auth.uid();
  device_row record;
begin
  if current_user_id is null then
    raise exception 'Não autenticado.';
  end if;
  if normalized_code !~ '^[A-Z0-9_-]{4,64}$' then
    return null;
  end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id
      and is_active = true
      and role in ('client_admin', 'super_admin')
  ) then
    raise exception 'Sem permissão para associar dispositivos.';
  end if;

  select d.device_id, d.name, d.location, d.pairing_status
  into device_row
  from public.devices d
  where upper(d.pairing_code) = normalized_code
  limit 1;

  if not found then return null; end if;
  return jsonb_build_object(
    'device_id', device_row.device_id,
    'name', device_row.name,
    'location', device_row.location,
    'pairing_status', device_row.pairing_status
  );
end;
$$;

create or replace function public.claim_device_pairing(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text := upper(btrim(coalesce(p_code, '')));
  current_user_id uuid := auth.uid();
  device_row record;
  already_has_access boolean;
begin
  if current_user_id is null then
    raise exception 'Não autenticado.';
  end if;
  if normalized_code !~ '^[A-Z0-9_-]{4,64}$' then
    raise exception 'Código de associação inválido.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id
      and is_active = true
      and role in ('client_admin', 'super_admin')
  ) then
    raise exception 'Sem permissão para associar dispositivos.';
  end if;

  select d.device_id, d.pairing_status
  into device_row
  from public.devices d
  where upper(d.pairing_code) = normalized_code
  for update;

  if not found then
    raise exception 'Código de associação inválido.';
  end if;

  select exists (
    select 1 from public.device_access da
    where da.user_id = current_user_id
      and da.device_id = device_row.device_id
  ) into already_has_access;

  if lower(coalesce(device_row.pairing_status, 'unassigned')) = 'assigned' then
    if already_has_access then
      return jsonb_build_object(
        'device_id', device_row.device_id,
        'status', 'already_owned'
      );
    end if;
    raise exception 'Este dispositivo já foi associado.';
  end if;

  if not already_has_access then
    insert into public.device_access (user_id, device_id, can_view, can_edit)
    values (current_user_id, device_row.device_id, true, true);
  end if;

  update public.devices
  set pairing_status = 'assigned',
      pairing_code = null,
      paired_at = now(),
      paired_by = current_user_id,
      updated_at = now()
  where device_id = device_row.device_id;

  return jsonb_build_object(
    'device_id', device_row.device_id,
    'status', 'paired'
  );
end;
$$;

revoke all on function public.preview_device_pairing(text) from public, anon;
revoke all on function public.claim_device_pairing(text) from public, anon;
grant execute on function public.preview_device_pairing(text) to authenticated;
grant execute on function public.claim_device_pairing(text) to authenticated;
