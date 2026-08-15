create or replace function public.register_maintenance_service(
  p_operation_id uuid,
  p_device_id uuid,
  p_reference_id uuid,
  p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_cached jsonb;
  v_previous_count integer;
  v_last_service_at timestamptz;
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id();

  if v_actor.id is null or not app_private.can_operate('maintenance') then
    raise exception 'operation_not_authorized' using errcode = '42501';
  end if;

  v_cached := app_private.claim_operation(
    p_operation_id,
    p_device_id,
    'register_maintenance_service',
    jsonb_build_object(
      'reference_id', p_reference_id,
      'notes', coalesce(p_notes, '')
    )
  );
  if v_cached is not null then
    return v_cached;
  end if;

  select max(created_at)
  into v_last_service_at
  from public.maintenance_events
  where event_type = 'service';

  select coalesce(
    sum(greatest(sale.quantity - coalesce(returned.quantity, 0), 0)),
    0
  )::integer
  into v_previous_count
  from public.sales sale
  left join (
    select sale_id, sum(quantity)::integer as quantity
    from public.sale_returns
    group by sale_id
  ) returned on returned.sale_id = sale.id
  where sale.status = 'active'
    and sale.created_at > coalesce(
      v_last_service_at,
      '-infinity'::timestamptz
    );

  insert into public.maintenance_events(
    id, event_type, quantity, previous_count, notes, user_id, operation_id
  ) values (
    p_reference_id, 'service', 0, v_previous_count, coalesce(p_notes, ''),
    v_actor.id, p_operation_id
  );

  insert into public.audit_log(
    user_id, device_id, action, entity, entity_id, before_data, after_data, reason
  ) values (
    v_actor.id, p_device_id, 'maintenance_service_registered', 'maintenance',
    p_reference_id, jsonb_build_object('count', v_previous_count),
    jsonb_build_object('count', 0), coalesce(p_notes, '')
  );

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object(
      'reference_id', p_reference_id,
      'previous_count', v_previous_count
    )
  );
end;
$$;

revoke execute on function public.register_maintenance_service(uuid,uuid,uuid,text)
  from public, anon;
grant execute on function public.register_maintenance_service(uuid,uuid,uuid,text)
  to authenticated;
