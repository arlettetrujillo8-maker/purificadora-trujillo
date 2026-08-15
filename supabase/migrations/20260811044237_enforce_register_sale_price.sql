-- Enforce the authoritative client/general price inside the transactional sale RPC.
create or replace function public.register_sale(
  p_operation_id uuid,
  p_device_id uuid,
  p_sale_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_cached jsonb;
  v_sale public.sales;
  v_location public.inventory_locations;
  v_round public.rounds;
  v_qty integer := (p_payload->>'quantity')::integer;
  v_unit bigint := (p_payload->>'unit_price_cents')::bigint;
  v_total bigint := (p_payload->>'total_cents')::bigint;
  v_paid bigint := (p_payload->>'paid_cents')::bigint;
  v_credit bigint := (p_payload->>'credit_cents')::bigint;
  v_method text := p_payload->>'payment_method';
  v_channel text := p_payload->>'channel';
  v_route text := nullif(p_payload->>'route','');
  v_round_id uuid := nullif(p_payload->>'round_id','')::uuid;
  v_cash_session uuid := nullif(p_payload->>'cash_session_id','')::uuid;
  v_client uuid := nullif(p_payload->>'client_id','')::uuid;
  v_location_id uuid := (p_payload->>'inventory_location_id')::uuid;
  v_expected_location text;
  v_expected_price bigint;
  v_override_reason text := nullif(trim(coalesce(p_payload->>'price_override_reason','')), '');
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id();

  if v_actor.id is null or not app_private.can_operate('create_sale') then
    raise exception 'operation_not_authorized' using errcode = '42501';
  end if;

  if v_actor.role = 'ventanilla' and v_channel not in ('ventanilla','fuera_ruta','fuera_horario') then
    raise exception 'channel_scope_violation' using errcode = '42501';
  end if;

  if v_actor.role = 'repartidor'
     and (v_channel <> v_actor.route or v_route <> v_actor.route) then
    raise exception 'route_scope_violation' using errcode = '42501';
  end if;

  v_expected_location := case
    when v_channel in ('ventanilla','fuera_ruta','fuera_horario') then 'local'
    when v_channel = 'ruta1' then 'route_1'
    when v_channel = 'ruta2' then 'route_2'
  end;

  if v_expected_location is null then
    raise exception 'invalid_sale_channel' using errcode = '22023';
  end if;

  if v_channel in ('ruta1','ruta2') then
    if v_round_id is null then
      raise exception 'active_round_required' using errcode = '23514';
    end if;
    select * into v_round
    from public.rounds
    where id = v_round_id
    for update;
    if v_round.id is null
       or v_round.route <> v_channel
       or v_round.status not in ('preparing','active')
       or (v_actor.role = 'repartidor' and v_round.user_id <> v_actor.id) then
      raise exception 'invalid_round_scope' using errcode = '42501';
    end if;
  elsif v_round_id is not null or v_route is not null then
    raise exception 'round_not_allowed_for_channel' using errcode = '23514';
  end if;

  if v_client is not null and not exists (
    select 1 from public.clients c
    where c.id = v_client
      and c.active
      and (
        v_actor.role in ('administrador','ventanilla')
        or c.created_by = v_actor.id
        or c.normal_route = v_actor.route
      )
  ) then
    raise exception 'client_scope_violation' using errcode = '42501';
  end if;

  v_cached := app_private.claim_operation(p_operation_id,p_device_id,'register_sale',p_payload);
  if v_cached is not null then return v_cached; end if;

  if v_client is not null then
    select c.special_price_cents
    into v_expected_price
    from public.clients c
    where c.id = v_client
    for share;
  end if;

  if v_expected_price is null then
    select coalesce(nullif(s.value->>'default_price_cents','')::bigint, 1400)
    into v_expected_price
    from public.settings s
    where s.key = 'pricing';

    v_expected_price := coalesce(v_expected_price, 1400);
  end if;

  if v_expected_price < 0 then
    raise exception 'invalid_expected_sale_price' using errcode = '23514';
  end if;

  if v_unit <> v_expected_price then
    if not app_private.can_operate('override_sale_price') then
      raise exception 'price_override_not_authorized' using errcode = '42501';
    end if;
    if v_override_reason is null then
      raise exception 'price_override_reason_required' using errcode = '23514';
    end if;
  end if;

  if v_qty <= 0 or v_unit < 0 or v_total <> v_qty*v_unit
     or v_paid < 0 or v_credit < 0 or v_paid+v_credit <> v_total then
    raise exception 'invalid_sale_amounts' using errcode = '23514';
  end if;
  if v_credit > 0 and v_client is null then
    raise exception 'credit_requires_client' using errcode = '23514';
  end if;
  if v_method in ('efectivo','mixto') and v_paid > 0 and not exists (
    select 1 from public.cash_sessions c
    where c.id = v_cash_session
      and c.user_id = v_actor.id
      and c.status = 'open'
  ) then
    raise exception 'open_cash_session_required' using errcode = '23514';
  end if;

  select * into v_location
  from public.inventory_locations
  where id = v_location_id
  for update;

  if v_location.id is null
     or v_location.container_type <> 'full'
     or v_location.location_code <> v_expected_location then
    raise exception 'inventory_scope_violation' using errcode = '42501';
  end if;
  if v_location.quantity < v_qty then
    raise exception 'insufficient_inventory' using errcode = '23514';
  end if;

  update public.inventory_locations
  set quantity = quantity-v_qty, updated_at = now()
  where id = v_location.id;

  insert into public.sales(
    id,folio,client_id,user_id,channel,route,round_id,cash_session_id,
    quantity,unit_price_cents,total_cents,paid_cents,credit_cents,
    payment_method,device_id,operation_id,notes,occurred_at
  )
  values (
    p_sale_id,app_private.next_folio('sale'),v_client,v_actor.id,v_channel,
    case when v_channel in ('ruta1','ruta2') then v_channel else null end,
    v_round_id,v_cash_session,v_qty,v_unit,v_total,v_paid,v_credit,v_method,
    p_device_id,p_operation_id,coalesce(p_payload->>'notes',''),
    coalesce((p_payload->>'occurred_at')::timestamptz,now())
  )
  returning * into v_sale;

  insert into public.inventory_movements(
    container_type,from_location_id,quantity,movement_type,reference_type,
    reference_id,round_id,user_id,operation_id
  )
  values('full',v_location.id,v_qty,'sale','sale',v_sale.id,v_sale.round_id,v_actor.id,p_operation_id);

  if v_credit > 0 then
    insert into public.ledger_entries(
      client_id,entry_type,amount_cents,sale_id,reason,created_by,operation_id
    )
    values(v_client,'charge',v_credit,v_sale.id,'Venta fiada',v_actor.id,p_operation_id);
  end if;

  if v_method in ('efectivo','mixto') and v_paid > 0 then
    insert into public.cash_movements(
      cash_session_id,movement_type,direction,amount_cents,reference_type,
      reference_id,user_id,operation_id
    )
    values(v_cash_session,'cash_sale','in',v_paid,'sale',v_sale.id,v_actor.id,p_operation_id);
  end if;

  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data)
  values(v_actor.id,p_device_id,'sale_registered','sale',v_sale.id,to_jsonb(v_sale));

  if v_unit <> v_expected_price then
    insert into public.audit_log(
      user_id,device_id,action,entity,entity_id,before_data,after_data,reason
    ) values (
      v_actor.id,p_device_id,'sale_price_overridden','sale',v_sale.id,
      jsonb_build_object('expected_price_cents',v_expected_price),
      jsonb_build_object('unit_price_cents',v_unit),
      v_override_reason
    );
  end if;

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object('sale',to_jsonb(v_sale))
  );
end;
$$;

revoke all on function public.register_sale(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.register_sale(uuid,uuid,uuid,jsonb) to authenticated;
