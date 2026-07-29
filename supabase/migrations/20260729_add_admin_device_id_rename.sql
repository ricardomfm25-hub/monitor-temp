-- Permite ao super admin alterar o identificador técnico de um dispositivo
-- sem perder leituras, alertas, acessos ou preferências de notificação.

do $$
declare
  fk record;
  fk_definition text;
  device_id_attnum smallint;
begin
  select attnum::smallint
    into device_id_attnum
  from pg_attribute
  where attrelid = 'public.devices'::regclass
    and attname = 'device_id'
    and not attisdropped;

  for fk in
    select
      c.conname,
      c.conrelid::regclass as child_table,
      pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.devices'::regclass
      and c.confkey = array[device_id_attnum]
  loop
    fk_definition := fk.definition;

    if fk_definition ~* ' ON UPDATE ' then
      fk_definition := regexp_replace(
        fk_definition,
        ' ON UPDATE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)',
        ' ON UPDATE CASCADE',
        'i'
      );
    elsif fk_definition ~* ' ON DELETE ' then
      fk_definition := regexp_replace(
        fk_definition,
        ' ON DELETE ',
        ' ON UPDATE CASCADE ON DELETE ',
        'i'
      );
    else
      fk_definition := fk_definition || ' ON UPDATE CASCADE';
    end if;

    execute format(
      'alter table %s drop constraint %I, add constraint %I %s',
      fk.child_table,
      fk.conname,
      fk.conname,
      fk_definition
    );
  end loop;
end;
$$;

create or replace function public.rename_device_id(
  p_current_device_id text,
  p_new_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_id text := btrim(coalesce(p_current_device_id, ''));
  next_id text := btrim(coalesce(p_new_device_id, ''));
  is_authorized boolean;
begin
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and is_active = true
  )
  into is_authorized;

  if not is_authorized then
    raise exception 'Sem permissão para alterar o Device ID.';
  end if;

  if current_id = '' then
    raise exception 'Device ID atual inválido.';
  end if;

  if next_id !~ '^[A-Za-z0-9_-]{3,64}$' then
    raise exception 'O novo Device ID deve usar 3 a 64 letras, números, _ ou -.';
  end if;

  if current_id = next_id then
    return jsonb_build_object('device_id', current_id, 'changed', false);
  end if;

  perform 1
  from public.devices
  where device_id = current_id
  for update;

  if not found then
    raise exception 'Dispositivo não encontrado.';
  end if;

  if exists (select 1 from public.devices where device_id = next_id) then
    raise exception 'Já existe um dispositivo com esse Device ID.';
  end if;

  update public.devices
  set device_id = next_id,
      updated_at = now()
  where device_id = current_id;

  return jsonb_build_object(
    'device_id', next_id,
    'previous_device_id', current_id,
    'changed', true
  );
end;
$$;

revoke all on function public.rename_device_id(text, text) from public;
grant execute on function public.rename_device_id(text, text) to authenticated;
