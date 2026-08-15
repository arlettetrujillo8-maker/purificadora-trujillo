-- Operadores de la app: la cuenta Supabase autoriza el dispositivo y el PIN
-- identifica al empleado. Los PIN nunca se exponen en public ni al navegador.

alter table public.profiles
  alter column auth_user_id drop not null,
  add column if not exists pin_configured boolean not null default false;

create table if not exists app_private.operator_pins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

alter table app_private.operator_pins enable row level security;
revoke all on table app_private.operator_pins from public, anon, authenticated;

-- El administrador inicial conserva el PIN solicitado para el piloto. Los
-- demás empleados deben recibir un PIN desde Empleados antes de iniciar turno.
insert into app_private.operator_pins(profile_id, pin_hash)
select p.id, extensions.crypt('1234', extensions.gen_salt('bf', 10))
from public.profiles p
where p.role = 'administrador'
on conflict (profile_id) do nothing;

update public.profiles p
set pin_configured = true
where exists (
  select 1 from app_private.operator_pins credentials
  where credentials.profile_id = p.id
);

create or replace function public.validate_operator_pin(
  p_profile_id uuid,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, app_private
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_hash text;
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id() and active;

  if v_actor.id is null then
    return false;
  end if;

  select * into v_target
  from public.profiles
  where id = p_profile_id and active;

  if v_target.id is null
    or not (v_actor.role = 'administrador' or v_actor.id = v_target.id)
    or p_pin !~ '^[0-9]{4,8}$'
  then
    return false;
  end if;

  select credentials.pin_hash into v_hash
  from app_private.operator_pins credentials
  where credentials.profile_id = v_target.id;

  return v_hash is not null
    and extensions.crypt(p_pin, v_hash) = v_hash;
end;
$$;

create or replace function public.save_operator(
  p_profile_id uuid,
  p_device_id uuid,
  p_name text,
  p_username text,
  p_role text,
  p_center text,
  p_permissions text[],
  p_pin text
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, app_private
as $$
declare
  v_actor public.profiles%rowtype;
  v_before public.profiles%rowtype;
  v_operator public.profiles%rowtype;
  v_id uuid := coalesce(p_profile_id, extensions.gen_random_uuid());
  v_name text := trim(coalesce(p_name, ''));
  v_username text := lower(trim(coalesce(p_username, '')));
  v_center text := case when p_role = 'repartidor' then p_center else 'local' end;
  v_route text := case when p_role = 'repartidor' then p_center else null end;
  v_pin text := nullif(trim(coalesce(p_pin, '')), '');
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id() and active;

  if v_actor.id is null or v_actor.role <> 'administrador' then
    raise exception 'operation_not_authorized';
  end if;
  if v_name = '' or length(v_name) > 120 then
    raise exception 'invalid_operator_name';
  end if;
  if v_username !~ '^[a-z0-9][a-z0-9._-]{0,39}$' then
    raise exception 'invalid_operator_username';
  end if;
  if p_role not in ('administrador','ventanilla','repartidor','caja','inventario') then
    raise exception 'invalid_operator_role';
  end if;
  if v_center not in ('local','ruta1','ruta2')
    or (p_role = 'repartidor' and v_center = 'local')
  then
    raise exception 'invalid_operator_center';
  end if;
  if v_pin is not null and v_pin !~ '^[0-9]{4,8}$' then
    raise exception 'invalid_operator_pin';
  end if;

  select * into v_before from public.profiles where id = p_profile_id;

  if p_profile_id is not null and v_before.id is null then
    raise exception 'operator_not_found';
  end if;
  if p_profile_id is null and v_pin is null then
    raise exception 'operator_pin_required';
  end if;
  if v_before.id is not null
    and v_before.role = 'administrador'
    and v_before.active
    and p_role <> 'administrador'
    and (select count(*) from public.profiles where role = 'administrador' and active) <= 1
  then
    raise exception 'last_administrator_protected';
  end if;

  insert into public.profiles(
    id, auth_user_id, name, username, role, center, route,
    permissions, active, pin_configured
  ) values (
    v_id, null, v_name, v_username, p_role, v_center, v_route,
    coalesce(p_permissions, '{}'), true, v_pin is not null
  )
  on conflict (id) do update set
    name = excluded.name,
    username = excluded.username,
    role = excluded.role,
    center = excluded.center,
    route = excluded.route,
    permissions = excluded.permissions,
    pin_configured = public.profiles.pin_configured or v_pin is not null,
    updated_at = now()
  returning * into v_operator;

  if v_pin is not null then
    insert into app_private.operator_pins(profile_id, pin_hash, updated_at)
    values (
      v_operator.id,
      extensions.crypt(v_pin, extensions.gen_salt('bf', 10)),
      now()
    )
    on conflict (profile_id) do update set
      pin_hash = excluded.pin_hash,
      updated_at = excluded.updated_at;
  end if;

  insert into public.audit_log(
    user_id, device_id, action, entity, entity_id, before_data, after_data
  ) values (
    v_actor.id,
    p_device_id,
    case when v_before.id is null then 'operator_created' else 'operator_updated' end,
    'operator',
    v_operator.id,
    case when v_before.id is null then null else to_jsonb(v_before) - 'auth_user_id' end,
    to_jsonb(v_operator) - 'auth_user_id'
  );

  return v_operator;
exception
  when unique_violation then
    raise exception 'duplicate_operator_username';
end;
$$;

create or replace function public.set_operator_active(
  p_profile_id uuid,
  p_active boolean,
  p_device_id uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor public.profiles%rowtype;
  v_before public.profiles%rowtype;
  v_operator public.profiles%rowtype;
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id() and active;

  if v_actor.id is null or v_actor.role <> 'administrador' then
    raise exception 'operation_not_authorized';
  end if;

  select * into v_before from public.profiles where id = p_profile_id;
  if v_before.id is null then
    raise exception 'operator_not_found';
  end if;
  if v_before.id = v_actor.id and not p_active then
    raise exception 'current_administrator_protected';
  end if;
  if v_before.role = 'administrador'
    and v_before.active
    and not p_active
    and (select count(*) from public.profiles where role = 'administrador' and active) <= 1
  then
    raise exception 'last_administrator_protected';
  end if;

  update public.profiles
  set active = p_active, updated_at = now()
  where id = p_profile_id
  returning * into v_operator;

  insert into public.audit_log(
    user_id, device_id, action, entity, entity_id, before_data, after_data
  ) values (
    v_actor.id,
    p_device_id,
    case when p_active then 'operator_activated' else 'operator_deactivated' end,
    'operator',
    v_operator.id,
    to_jsonb(v_before) - 'auth_user_id',
    to_jsonb(v_operator) - 'auth_user_id'
  );

  return v_operator;
end;
$$;

revoke all on function public.validate_operator_pin(uuid,text) from public, anon, authenticated;
revoke all on function public.save_operator(uuid,uuid,text,text,text,text,text[],text) from public, anon, authenticated;
revoke all on function public.set_operator_active(uuid,boolean,uuid) from public, anon, authenticated;

grant execute on function public.validate_operator_pin(uuid,text) to authenticated;
grant execute on function public.save_operator(uuid,uuid,text,text,text,text,text[],text) to authenticated;
grant execute on function public.set_operator_active(uuid,boolean,uuid) to authenticated;
