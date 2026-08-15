create or replace function public.delete_operator(
  p_profile_id uuid,
  p_device_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
begin
  select *
  into v_actor
  from public.profiles
  where id = app_private.current_profile_id()
    and active = true;

  if v_actor.id is null or v_actor.role <> 'administrador' then
    raise exception 'operation_not_authorized';
  end if;

  select *
  into v_target
  from public.profiles
  where id = p_profile_id;

  if v_target.id is null then
    raise exception 'operator_not_found';
  end if;

  if v_target.id = v_actor.id then
    raise exception 'current_administrator_protected';
  end if;

  if v_target.role = 'administrador'
    and v_target.active = true
    and (
      select count(*)
      from public.profiles
      where role = 'administrador'
        and active = true
    ) <= 1 then
    raise exception 'last_administrator_protected';
  end if;

  insert into public.audit_log (
    user_id,
    device_id,
    action,
    entity,
    entity_id,
    before_data,
    after_data
  ) values (
    v_actor.id,
    p_device_id,
    'operator_deleted',
    'operator',
    v_target.id,
    to_jsonb(v_target) - 'auth_user_id',
    null
  );

  begin
    delete from public.profiles
    where id = v_target.id;
  exception
    when foreign_key_violation then
      raise exception 'operator_has_history';
  end;

  return v_target.id;
end;
$$;

revoke all on function public.delete_operator(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.delete_operator(uuid, uuid)
to authenticated;

notify pgrst, 'reload schema';
