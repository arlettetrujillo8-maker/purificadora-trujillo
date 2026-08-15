-- V3.0 security hardening for the RPC surface already deployed.
-- Keep identity helpers callable for RLS, but prevent authenticated clients
-- from invoking transactional internals directly.

revoke all on function app_private.next_folio(text) from public, anon, authenticated;
revoke all on function app_private.claim_operation(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function app_private.complete_operation(uuid, jsonb) from public, anon, authenticated;

create or replace function app_private.can_operate(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    p.role = 'administrador'
    or p_capability = any(p.permissions)
    or (p_capability = 'create_client' and p.role in ('ventanilla','repartidor'))
    or (p_capability = 'open_cash' and p.role in ('ventanilla','repartidor','caja'))
    or (p_capability = 'create_sale' and p.role in ('ventanilla','repartidor'))
    or (p_capability = 'register_payment' and p.role in ('ventanilla','repartidor')),
    false
  )
  from public.profiles p
  where p.id = app_private.current_profile_id()
    and p.active
$$;

revoke all on function app_private.can_operate(text) from public, anon, authenticated;

create unique index if not exists clients_phone_unique_idx
  on public.clients(phone_normalized)
  where phone_normalized <> '';

create or replace function public.create_client(
  p_operation_id uuid,
  p_device_id uuid,
  p_client_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_cached jsonb;
  v_client public.clients;
  v_route text := coalesce(p_payload->>'normal_route','ninguna');
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id();

  if v_actor.id is null or not app_private.can_operate('create_client') then
    raise exception 'operation_not_authorized' using errcode = '42501';
  end if;

  if v_actor.role = 'repartidor' and v_route not in (v_actor.route, 'ninguna') then
    raise exception 'route_scope_violation' using errcode = '42501';
  end if;

  v_cached := app_private.claim_operation(p_operation_id,p_device_id,'create_client',p_payload);
  if v_cached is not null then return v_cached; end if;

  insert into public.clients(
    id,name,phone,address,normal_route,client_type,
    special_price_cents,notes,created_by
  )
  values (
    p_client_id,
    trim(p_payload->>'name'),
    coalesce(p_payload->>'phone',''),
    coalesce(p_payload->>'address',''),
    v_route,
    coalesce(p_payload->>'client_type','general'),
    nullif(p_payload->>'special_price_cents','')::bigint,
    coalesce(p_payload->>'notes',''),
    v_actor.id
  )
  returning * into v_client;

  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data)
  values(v_actor.id,p_device_id,'client_created','client',v_client.id,to_jsonb(v_client));

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object('client',to_jsonb(v_client))
  );
exception
  when unique_violation then
    if exists (
      select 1 from public.clients c
      where c.phone_normalized = regexp_replace(coalesce(p_payload->>'phone',''), '[^0-9]', '', 'g')
        and c.phone_normalized <> ''
    ) then
      raise exception 'duplicate_client_phone' using errcode = '23505';
    end if;
    raise;
end;
$$;

create or replace function public.open_cash_session(
  p_operation_id uuid,
  p_device_id uuid,
  p_session_id uuid,
  p_opening_cents bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_payload jsonb;
  v_cached jsonb;
  v_session public.cash_sessions;
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id();

  if v_actor.id is null or not app_private.can_operate('open_cash') then
    raise exception 'operation_not_authorized' using errcode = '42501';
  end if;

  v_payload := jsonb_build_object('session_id',p_session_id,'opening_cents',p_opening_cents);
  v_cached := app_private.claim_operation(p_operation_id,p_device_id,'open_cash_session',v_payload);
  if v_cached is not null then return v_cached; end if;
  if p_opening_cents < 0 then
    raise exception 'invalid_opening_amount' using errcode = '22023';
  end if;

  insert into public.cash_sessions(id,user_id,center,opening_cents,opened_operation_id)
  values(p_session_id,v_actor.id,v_actor.center,p_opening_cents,p_operation_id)
  returning * into v_session;

  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data)
  values(v_actor.id,p_device_id,'cash_opened','cash_session',v_session.id,to_jsonb(v_session));

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object('cash_session',to_jsonb(v_session))
  );
end;
$$;

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

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object('sale',to_jsonb(v_sale))
  );
end;
$$;

create or replace function public.register_payment(
  p_operation_id uuid,
  p_device_id uuid,
  p_payment_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_cached jsonb;
  v_payment public.payments;
  v_client uuid := (p_payload->>'client_id')::uuid;
  v_amount bigint := (p_payload->>'amount_cents')::bigint;
  v_method text := p_payload->>'payment_method';
  v_cash uuid := nullif(p_payload->>'cash_session_id','')::uuid;
  v_balance bigint;
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id();

  if v_actor.id is null or not app_private.can_operate('register_payment') then
    raise exception 'operation_not_authorized' using errcode = '42501';
  end if;

  if not exists (
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

  v_cached := app_private.claim_operation(p_operation_id,p_device_id,'register_payment',p_payload);
  if v_cached is not null then return v_cached; end if;

  select coalesce(sum(amount_cents),0)
  into v_balance
  from public.ledger_entries
  where client_id = v_client;

  if v_amount <= 0 or v_amount > v_balance then
    raise exception 'invalid_payment_amount' using errcode = '23514';
  end if;
  if v_method = 'efectivo' and not exists (
    select 1 from public.cash_sessions
    where id = v_cash and user_id = v_actor.id and status = 'open'
  ) then
    raise exception 'open_cash_session_required' using errcode = '23514';
  end if;

  insert into public.payments(
    id,folio,client_id,user_id,cash_session_id,amount_cents,payment_method,
    device_id,operation_id,notes,occurred_at
  )
  values (
    p_payment_id,app_private.next_folio('payment'),v_client,v_actor.id,v_cash,
    v_amount,v_method,p_device_id,p_operation_id,coalesce(p_payload->>'notes',''),
    coalesce((p_payload->>'occurred_at')::timestamptz,now())
  )
  returning * into v_payment;

  insert into public.ledger_entries(
    client_id,entry_type,amount_cents,payment_id,reason,created_by,operation_id
  )
  values(v_client,'payment',-v_amount,v_payment.id,'Abono de fiado',v_actor.id,p_operation_id);

  if v_method = 'efectivo' then
    insert into public.cash_movements(
      cash_session_id,movement_type,direction,amount_cents,reference_type,
      reference_id,user_id,operation_id
    )
    values(v_cash,'debt_payment','in',v_amount,'payment',v_payment.id,v_actor.id,p_operation_id);
  end if;

  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data)
  values(v_actor.id,p_device_id,'payment_registered','payment',v_payment.id,to_jsonb(v_payment));

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object('payment',to_jsonb(v_payment))
  );
end;
$$;

revoke all on function public.create_client(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.open_cash_session(uuid,uuid,uuid,bigint) from public, anon, authenticated;
revoke all on function public.register_sale(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.register_payment(uuid,uuid,uuid,jsonb) from public, anon, authenticated;

grant execute on function public.create_client(uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.open_cash_session(uuid,uuid,uuid,bigint) to authenticated;
grant execute on function public.register_sale(uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.register_payment(uuid,uuid,uuid,jsonb) to authenticated;
