-- Purificadora Trujillo V3.0.1
-- Complete the online transactional API used by the browser data layer.

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
    or (p_capability in ('create_client','edit_client','create_sale','register_payment','open_cash','close_cash')
        and p.role in ('ventanilla','repartidor'))
    or (p_capability in ('open_cash','close_cash','cash_delivery','create_expense') and p.role = 'caja')
    or (p_capability in ('view_inventory','adjust_inventory','transfer_inventory','supplies','maintenance')
        and p.role = 'inventario')
    or (p_capability = 'rounds' and p.role = 'repartidor'),
    false
  )
  from public.profiles p
  where p.id = app_private.current_profile_id() and p.active
$$;

revoke all on function app_private.can_operate(text) from public, anon, authenticated;

create or replace function app_private.inventory_location_id(p_legacy_code text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select i.id
  from public.inventory_locations i
  where
    (p_legacy_code='local' and i.location_code='local' and i.container_type='full')
    or (p_legacy_code='ruta1' and i.location_code='route_1' and i.container_type='full')
    or (p_legacy_code='ruta2' and i.location_code='route_2' and i.container_type='full')
    or (p_legacy_code='empty_local' and i.location_code='local' and i.container_type='empty')
    or (p_legacy_code='empty_ruta1' and i.location_code='route_1' and i.container_type='empty')
    or (p_legacy_code='empty_ruta2' and i.location_code='route_2' and i.container_type='empty')
    or (p_legacy_code='lavado' and i.location_code='wash' and i.container_type='empty')
    or (p_legacy_code='danados' and i.location_code='damaged' and i.container_type='damaged')
  limit 1
$$;

revoke all on function app_private.inventory_location_id(text) from public, anon, authenticated;

create or replace function app_private.cash_expected_cents(p_session_id uuid)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select s.opening_cents + coalesce(sum(
    case m.direction when 'in' then m.amount_cents else -m.amount_cents end
  ),0)::bigint
  from public.cash_sessions s
  left join public.cash_movements m on m.cash_session_id = s.id
  where s.id = p_session_id
  group by s.id, s.opening_cents
$$;

revoke all on function app_private.cash_expected_cents(uuid) from public, anon, authenticated;

create or replace function public.update_client(
  p_operation_id uuid,
  p_device_id uuid,
  p_client_id uuid,
  p_expected_version integer,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_client public.clients; v_before jsonb; v_cached jsonb; v_route text;
begin
  select * into v_actor from public.profiles where id = app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('edit_client') then
    raise exception 'operation_not_authorized' using errcode='42501';
  end if;
  select * into v_client from public.clients where id=p_client_id for update;
  if v_client.id is null then raise exception 'client_not_found' using errcode='P0002'; end if;
  v_route := coalesce(p_payload->>'normal_route',v_client.normal_route);
  if v_actor.role='repartidor' and v_client.normal_route not in (v_actor.route,'ninguna') then
    raise exception 'client_scope_violation' using errcode='42501';
  end if;
  if v_actor.role='repartidor' and v_route not in (v_actor.route,'ninguna') then
    raise exception 'route_scope_violation' using errcode='42501';
  end if;
  v_cached := app_private.claim_operation(p_operation_id,p_device_id,'update_client',
    jsonb_build_object('client_id',p_client_id,'expected_version',p_expected_version,'payload',p_payload));
  if v_cached is not null then return v_cached; end if;
  if v_client.version <> p_expected_version then raise exception 'stale_client_version' using errcode='40001'; end if;
  v_before := to_jsonb(v_client);
  update public.clients set
    name=trim(coalesce(p_payload->>'name',name)), phone=coalesce(p_payload->>'phone',phone),
    address=coalesce(p_payload->>'address',address), normal_route=v_route,
    client_type=coalesce(p_payload->>'client_type',client_type),
    special_price_cents=case when p_payload ? 'special_price_cents' then nullif(p_payload->>'special_price_cents','')::bigint else special_price_cents end,
    notes=coalesce(p_payload->>'notes',notes), active=coalesce((p_payload->>'active')::boolean,active),
    version=version+1, updated_at=now()
  where id=p_client_id returning * into v_client;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,before_data,after_data)
  values(v_actor.id,p_device_id,'client_updated','client',v_client.id,v_before,to_jsonb(v_client));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('client',to_jsonb(v_client)));
exception when unique_violation then
  raise exception 'duplicate_client_phone' using errcode='23505';
end;
$$;

create or replace function public.close_cash_session(
  p_operation_id uuid, p_device_id uuid, p_session_id uuid,
  p_counted_cents bigint, p_difference_reason text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_session public.cash_sessions; v_expected bigint; v_cached jsonb; v_payload jsonb;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('close_cash') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  if p_counted_cents < 0 then raise exception 'invalid_counted_amount' using errcode='22023'; end if;
  v_payload := jsonb_build_object('session_id',p_session_id,'counted_cents',p_counted_cents,'difference_reason',coalesce(p_difference_reason,''));
  v_cached := app_private.claim_operation(p_operation_id,p_device_id,'close_cash_session',v_payload);
  if v_cached is not null then return v_cached; end if;
  select * into v_session from public.cash_sessions where id=p_session_id for update;
  if v_session.id is null or v_session.status <> 'open' then raise exception 'cash_session_not_open' using errcode='55000'; end if;
  if v_session.user_id <> v_actor.id then raise exception 'cash_session_owner_mismatch' using errcode='42501'; end if;
  v_expected := app_private.cash_expected_cents(v_session.id);
  if p_counted_cents <> v_expected and length(trim(coalesce(p_difference_reason,'')))=0 then
    raise exception 'difference_reason_required' using errcode='22023';
  end if;
  update public.cash_sessions set status='closed',closed_at=now(),expected_cents=v_expected,
    counted_cents=p_counted_cents,difference_cents=p_counted_cents-v_expected,
    difference_reason=nullif(trim(coalesce(p_difference_reason,'')),''),closed_operation_id=p_operation_id
  where id=p_session_id returning * into v_session;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,before_data,after_data,reason)
  values(v_actor.id,p_device_id,'cash_closed','cash_session',v_session.id,to_jsonb(v_session) - 'closed_at' - 'status',to_jsonb(v_session),coalesce(p_difference_reason,''));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('cash_session',to_jsonb(v_session)));
end;
$$;

create or replace function public.register_cash_movement(
  p_operation_id uuid, p_device_id uuid, p_movement_id uuid, p_session_id uuid,
  p_movement_type text, p_direction text, p_amount_cents bigint, p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_session public.cash_sessions; v_movement public.cash_movements; v_cached jsonb; v_payload jsonb;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('cash_adjustments') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  if p_amount_cents <= 0 or p_direction not in ('in','out') or p_movement_type not in ('withdrawal','deposit','adjustment') or length(trim(p_reason))=0 then
    raise exception 'invalid_cash_movement' using errcode='22023';
  end if;
  v_payload:=jsonb_build_object('movement_id',p_movement_id,'session_id',p_session_id,'type',p_movement_type,'direction',p_direction,'amount_cents',p_amount_cents,'reason',p_reason);
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'register_cash_movement',v_payload);
  if v_cached is not null then return v_cached; end if;
  select * into v_session from public.cash_sessions where id=p_session_id for update;
  if v_session.id is null or v_session.status<>'open' or v_session.user_id<>v_actor.id then raise exception 'cash_session_not_available' using errcode='42501'; end if;
  if p_direction='out' and p_amount_cents>app_private.cash_expected_cents(p_session_id) then raise exception 'insufficient_cash' using errcode='23514'; end if;
  insert into public.cash_movements(cash_session_id,movement_type,direction,amount_cents,reference_type,reference_id,user_id,operation_id)
  values(p_session_id,p_movement_type,p_direction,p_amount_cents,'manual',p_movement_id,v_actor.id,p_operation_id)
  returning * into v_movement;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data,reason)
  values(v_actor.id,p_device_id,'cash_movement_created','cash_movement',v_movement.id,to_jsonb(v_movement),p_reason);
  return app_private.complete_operation(p_operation_id,jsonb_build_object('cash_movement',to_jsonb(v_movement)));
end;
$$;

create or replace function public.transfer_cash(
  p_operation_id uuid, p_device_id uuid, p_transfer_id uuid,
  p_from_session_id uuid, p_to_session_id uuid, p_amount_cents bigint, p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_from public.cash_sessions; v_to public.cash_sessions; v_cached jsonb; v_payload jsonb;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('cash_delivery') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  if p_amount_cents<=0 or p_from_session_id=p_to_session_id then raise exception 'invalid_cash_transfer' using errcode='22023'; end if;
  v_payload:=jsonb_build_object('transfer_id',p_transfer_id,'from',p_from_session_id,'to',p_to_session_id,'amount_cents',p_amount_cents,'notes',coalesce(p_notes,''));
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'transfer_cash',v_payload);
  if v_cached is not null then return v_cached; end if;
  select * into v_from from public.cash_sessions where id=p_from_session_id for update;
  select * into v_to from public.cash_sessions where id=p_to_session_id for update;
  if v_from.status<>'open' or v_to.status<>'open' or v_from.user_id<>v_actor.id then raise exception 'cash_session_not_available' using errcode='42501'; end if;
  if p_amount_cents>app_private.cash_expected_cents(p_from_session_id) then raise exception 'insufficient_cash' using errcode='23514'; end if;
  insert into public.cash_movements(cash_session_id,movement_type,direction,amount_cents,reference_type,reference_id,user_id,operation_id)
  values(p_from_session_id,'route_handover','out',p_amount_cents,'cash_transfer',p_transfer_id,v_actor.id,p_operation_id);
  insert into public.cash_movements(cash_session_id,movement_type,direction,amount_cents,reference_type,reference_id,user_id,operation_id)
  values(p_to_session_id,'deposit','in',p_amount_cents,'cash_transfer',p_transfer_id,v_actor.id,p_operation_id);
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data,reason)
  values(v_actor.id,p_device_id,'cash_transferred','cash_transfer',p_transfer_id,v_payload,coalesce(p_notes,''));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('transfer_id',p_transfer_id));
end;
$$;

create or replace function public.create_expense(
  p_operation_id uuid, p_device_id uuid, p_expense_id uuid, p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_expense public.expenses; v_session public.cash_sessions; v_cached jsonb; v_amount bigint; v_affects boolean; v_method text;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('create_expense') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  v_amount:=(p_payload->>'amount_cents')::bigint; v_affects:=coalesce((p_payload->>'affects_cash')::boolean,true); v_method:=p_payload->>'payment_method';
  if v_amount<=0 or length(trim(p_payload->>'concept'))=0 then raise exception 'invalid_expense' using errcode='22023'; end if;
  if coalesce(p_payload->>'center',v_actor.center)<>v_actor.center and v_actor.role<>'administrador' then raise exception 'center_scope_violation' using errcode='42501'; end if;
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'create_expense',p_payload);
  if v_cached is not null then return v_cached; end if;
  if v_affects and v_method='efectivo' then
    select * into v_session from public.cash_sessions where id=(p_payload->>'cash_session_id')::uuid for update;
    if v_session.id is null or v_session.status<>'open' or v_session.user_id<>v_actor.id then raise exception 'cash_session_required' using errcode='42501'; end if;
    if v_amount>app_private.cash_expected_cents(v_session.id) then raise exception 'insufficient_cash' using errcode='23514'; end if;
  end if;
  insert into public.expenses(id,concept,amount_cents,center,payment_method,affects_cash,cash_session_id,notes,user_id,operation_id,occurred_at)
  values(p_expense_id,trim(p_payload->>'concept'),v_amount,coalesce(p_payload->>'center',v_actor.center),v_method,v_affects,
    nullif(p_payload->>'cash_session_id','')::uuid,coalesce(p_payload->>'notes',''),v_actor.id,p_operation_id,coalesce((p_payload->>'occurred_at')::timestamptz,now()))
  returning * into v_expense;
  if v_affects and v_method='efectivo' then
    insert into public.cash_movements(cash_session_id,movement_type,direction,amount_cents,reference_type,reference_id,user_id,operation_id)
    values(v_expense.cash_session_id,'cash_expense','out',v_amount,'expense',v_expense.id,v_actor.id,p_operation_id);
  end if;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data)
  values(v_actor.id,p_device_id,'expense_created','expense',v_expense.id,to_jsonb(v_expense));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('expense',to_jsonb(v_expense)));
end;
$$;

revoke execute on function public.update_client(uuid,uuid,uuid,integer,jsonb) from public,anon;
revoke execute on function public.close_cash_session(uuid,uuid,uuid,bigint,text) from public,anon;
revoke execute on function public.register_cash_movement(uuid,uuid,uuid,uuid,text,text,bigint,text) from public,anon;
revoke execute on function public.transfer_cash(uuid,uuid,uuid,uuid,uuid,bigint,text) from public,anon;
revoke execute on function public.create_expense(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.update_client(uuid,uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.close_cash_session(uuid,uuid,uuid,bigint,text) to authenticated;
grant execute on function public.register_cash_movement(uuid,uuid,uuid,uuid,text,text,bigint,text) to authenticated;
grant execute on function public.transfer_cash(uuid,uuid,uuid,uuid,uuid,bigint,text) to authenticated;
grant execute on function public.create_expense(uuid,uuid,uuid,jsonb) to authenticated;

create or replace function public.transfer_inventory(
  p_operation_id uuid, p_device_id uuid, p_reference_id uuid,
  p_from_code text, p_to_code text, p_quantity integer, p_reason text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_from public.inventory_locations; v_to public.inventory_locations; v_cached jsonb; v_payload jsonb;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('transfer_inventory') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  if p_quantity<=0 or p_from_code=p_to_code then raise exception 'invalid_inventory_transfer' using errcode='22023'; end if;
  v_payload:=jsonb_build_object('reference_id',p_reference_id,'from',p_from_code,'to',p_to_code,'quantity',p_quantity,'reason',coalesce(p_reason,''));
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'transfer_inventory',v_payload);
  if v_cached is not null then return v_cached; end if;
  select * into v_from from public.inventory_locations where id=app_private.inventory_location_id(p_from_code) for update;
  select * into v_to from public.inventory_locations where id=app_private.inventory_location_id(p_to_code) for update;
  if v_from.id is null or v_to.id is null or v_from.container_type<>v_to.container_type then raise exception 'invalid_inventory_endpoints' using errcode='22023'; end if;
  if v_from.quantity<p_quantity then raise exception 'insufficient_inventory' using errcode='23514'; end if;
  update public.inventory_locations set quantity=quantity-p_quantity,updated_at=now() where id=v_from.id;
  update public.inventory_locations set quantity=quantity+p_quantity,updated_at=now() where id=v_to.id;
  insert into public.inventory_movements(container_type,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,user_id,operation_id)
  values(v_from.container_type,v_from.id,v_to.id,p_quantity,'transfer','inventory_transfer',p_reference_id,v_actor.id,p_operation_id);
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data,reason)
  values(v_actor.id,p_device_id,'inventory_transferred','inventory',p_reference_id,v_payload,coalesce(p_reason,''));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('reference_id',p_reference_id));
end;
$$;

create or replace function public.adjust_inventory(
  p_operation_id uuid, p_device_id uuid, p_reference_id uuid,
  p_location_code text, p_new_quantity integer, p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_location public.inventory_locations; v_delta integer; v_cached jsonb; v_payload jsonb;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('adjust_inventory') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  if p_new_quantity<0 or length(trim(p_reason))=0 then raise exception 'invalid_inventory_adjustment' using errcode='22023'; end if;
  select * into v_location from public.inventory_locations where id=app_private.inventory_location_id(p_location_code) for update;
  if v_location.id is null then raise exception 'inventory_location_not_found' using errcode='P0002'; end if;
  v_delta:=p_new_quantity-v_location.quantity;
  v_payload:=jsonb_build_object('reference_id',p_reference_id,'location',p_location_code,'new_quantity',p_new_quantity,'reason',p_reason);
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'adjust_inventory',v_payload);
  if v_cached is not null then return v_cached; end if;
  update public.inventory_locations set quantity=p_new_quantity,updated_at=now() where id=v_location.id;
  if v_delta<>0 then
    insert into public.inventory_movements(container_type,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,user_id,operation_id)
    values(v_location.container_type,case when v_delta<0 then v_location.id end,case when v_delta>0 then v_location.id end,abs(v_delta),'adjustment','inventory_adjustment',p_reference_id,v_actor.id,p_operation_id);
  end if;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,before_data,after_data,reason)
  values(v_actor.id,p_device_id,'inventory_adjusted','inventory',p_reference_id,jsonb_build_object('quantity',v_location.quantity),jsonb_build_object('quantity',p_new_quantity),p_reason);
  return app_private.complete_operation(p_operation_id,jsonb_build_object('location',p_location_code,'quantity',p_new_quantity));
end;
$$;

create or replace function public.start_round(
  p_operation_id uuid, p_device_id uuid, p_round_id uuid,
  p_route text, p_loaded_quantity integer, p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_local public.inventory_locations; v_route_location public.inventory_locations; v_round public.rounds; v_number bigint; v_cached jsonb; v_payload jsonb;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('rounds') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  if p_route not in ('ruta1','ruta2') or p_loaded_quantity<=0 then raise exception 'invalid_round' using errcode='22023'; end if;
  if v_actor.role='repartidor' and v_actor.route<>p_route then raise exception 'route_scope_violation' using errcode='42501'; end if;
  v_payload:=jsonb_build_object('round_id',p_round_id,'route',p_route,'loaded_quantity',p_loaded_quantity,'notes',coalesce(p_notes,''));
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'start_round',v_payload);
  if v_cached is not null then return v_cached; end if;
  if exists(select 1 from public.rounds where route=p_route and status<>'closed') then raise exception 'round_already_open' using errcode='23505'; end if;
  select * into v_local from public.inventory_locations where id=app_private.inventory_location_id('local') for update;
  select * into v_route_location from public.inventory_locations where id=app_private.inventory_location_id(p_route) for update;
  if v_local.quantity<p_loaded_quantity then raise exception 'insufficient_inventory' using errcode='23514'; end if;
  select coalesce(max(round_number),0)+1 into v_number from public.rounds where route=p_route;
  insert into public.rounds(id,route,user_id,round_number,loaded_full_qty,status,start_operation_id)
  values(p_round_id,p_route,v_actor.id,v_number,p_loaded_quantity,'active',p_operation_id) returning * into v_round;
  update public.inventory_locations set quantity=quantity-p_loaded_quantity,updated_at=now() where id=v_local.id;
  update public.inventory_locations set quantity=quantity+p_loaded_quantity,updated_at=now() where id=v_route_location.id;
  insert into public.inventory_movements(container_type,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id)
  values('full',v_local.id,v_route_location.id,p_loaded_quantity,'round_load','round',v_round.id,v_round.id,v_actor.id,p_operation_id);
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data,reason)
  values(v_actor.id,p_device_id,'round_started','round',v_round.id,to_jsonb(v_round),coalesce(p_notes,''));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('round',to_jsonb(v_round)));
end;
$$;

create or replace function public.close_round(
  p_operation_id uuid, p_device_id uuid, p_round_id uuid,
  p_returned_full integer, p_returned_empty integer, p_damaged integer, p_lost integer,
  p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_round public.rounds; v_route public.inventory_locations; v_local public.inventory_locations; v_wash public.inventory_locations; v_damaged_loc public.inventory_locations; v_sold integer; v_expected integer; v_cached jsonb; v_payload jsonb;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('rounds') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  if least(p_returned_full,p_returned_empty,p_damaged,p_lost)<0 then raise exception 'invalid_round_return' using errcode='22023'; end if;
  v_payload:=jsonb_build_object('round_id',p_round_id,'returned_full',p_returned_full,'returned_empty',p_returned_empty,'damaged',p_damaged,'lost',p_lost,'notes',coalesce(p_notes,''));
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'close_round',v_payload);
  if v_cached is not null then return v_cached; end if;
  select * into v_round from public.rounds where id=p_round_id for update;
  if v_round.id is null or v_round.status='closed' then raise exception 'round_not_open' using errcode='55000'; end if;
  if v_actor.role='repartidor' and (v_round.user_id<>v_actor.id or v_round.route<>v_actor.route) then raise exception 'route_scope_violation' using errcode='42501'; end if;
  select coalesce(sum(quantity),0)::integer into v_sold from public.sales where round_id=v_round.id and status='active';
  v_expected:=v_round.loaded_full_qty-v_sold;
  if p_returned_full+p_damaged+p_lost<>v_expected then raise exception 'round_return_mismatch' using errcode='23514'; end if;
  select * into v_route from public.inventory_locations where id=app_private.inventory_location_id(v_round.route) for update;
  select * into v_local from public.inventory_locations where id=app_private.inventory_location_id('local') for update;
  select * into v_wash from public.inventory_locations where id=app_private.inventory_location_id('lavado') for update;
  select * into v_damaged_loc from public.inventory_locations where id=app_private.inventory_location_id('danados') for update;
  if v_route.quantity<p_returned_full+p_damaged+p_lost then raise exception 'insufficient_route_inventory' using errcode='23514'; end if;
  update public.inventory_locations set quantity=quantity-(p_returned_full+p_damaged+p_lost),updated_at=now() where id=v_route.id;
  update public.inventory_locations set quantity=quantity+p_returned_full,updated_at=now() where id=v_local.id;
  update public.inventory_locations set quantity=quantity+p_returned_empty,updated_at=now() where id=v_wash.id;
  update public.inventory_locations set quantity=quantity+p_damaged,updated_at=now() where id=v_damaged_loc.id;
  if p_returned_full>0 then insert into public.inventory_movements(container_type,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id) values('full',v_route.id,v_local.id,p_returned_full,'round_return_full','round',v_round.id,v_round.id,v_actor.id,p_operation_id); end if;
  if p_damaged>0 then
    insert into public.inventory_movements(container_type,from_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id) values('full',v_route.id,p_damaged,'round_damaged_out','round',v_round.id,v_round.id,v_actor.id,p_operation_id);
    insert into public.inventory_movements(container_type,to_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id) values('damaged',v_damaged_loc.id,p_damaged,'round_damaged_in','round',v_round.id,v_round.id,v_actor.id,p_operation_id);
  end if;
  if p_lost>0 then insert into public.inventory_movements(container_type,from_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id) values('full',v_route.id,p_lost,'round_lost','round',v_round.id,v_round.id,v_actor.id,p_operation_id); end if;
  if p_returned_empty>0 then insert into public.inventory_movements(container_type,to_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id) values('empty',v_wash.id,p_returned_empty,'empty_returned','round',v_round.id,v_round.id,v_actor.id,p_operation_id); end if;
  update public.rounds set returned_at=now(),closed_at=now(),returned_full_qty=p_returned_full,returned_empty_qty=p_returned_empty,damaged_qty=p_damaged,lost_qty=p_lost,status='closed',close_operation_id=p_operation_id where id=v_round.id returning * into v_round;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data,reason) values(v_actor.id,p_device_id,'round_closed','round',v_round.id,to_jsonb(v_round),coalesce(p_notes,''));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('round',to_jsonb(v_round)));
end;
$$;

revoke execute on function public.transfer_inventory(uuid,uuid,uuid,text,text,integer,text) from public,anon;
revoke execute on function public.adjust_inventory(uuid,uuid,uuid,text,integer,text) from public,anon;
revoke execute on function public.start_round(uuid,uuid,uuid,text,integer,text) from public,anon;
revoke execute on function public.close_round(uuid,uuid,uuid,integer,integer,integer,integer,text) from public,anon;
grant execute on function public.transfer_inventory(uuid,uuid,uuid,text,text,integer,text) to authenticated;
grant execute on function public.adjust_inventory(uuid,uuid,uuid,text,integer,text) to authenticated;
grant execute on function public.start_round(uuid,uuid,uuid,text,integer,text) to authenticated;
grant execute on function public.close_round(uuid,uuid,uuid,integer,integer,integer,integer,text) to authenticated;

create or replace function public.upsert_supply(
  p_operation_id uuid, p_device_id uuid, p_supply_id uuid, p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_supply public.supplies; v_before jsonb; v_cached jsonb; v_initial numeric; v_is_new boolean;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('supplies') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  if length(trim(p_payload->>'name'))=0 or length(trim(p_payload->>'unit'))=0 then raise exception 'invalid_supply' using errcode='22023'; end if;
  v_initial:=coalesce((p_payload->>'initial_stock')::numeric,0);
  if v_initial<0 or coalesce((p_payload->>'minimum_stock')::numeric,0)<0 or coalesce((p_payload->>'cost_cents')::bigint,0)<0 or coalesce((p_payload->>'consumption_per_unit')::numeric,0)<0 then raise exception 'invalid_supply_values' using errcode='22023'; end if;
  select * into v_supply from public.supplies where id=p_supply_id for update;
  v_is_new:=v_supply.id is null; v_before:=case when v_is_new then null else to_jsonb(v_supply) end;
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'upsert_supply',jsonb_build_object('supply_id',p_supply_id,'payload',p_payload));
  if v_cached is not null then return v_cached; end if;
  if v_is_new then
    insert into public.supplies(id,name,category,unit,minimum_stock,current_stock,cost_cents,consumption_per_unit,active)
    values(p_supply_id,trim(p_payload->>'name'),coalesce(p_payload->>'category','general'),p_payload->>'unit',coalesce((p_payload->>'minimum_stock')::numeric,0),v_initial,coalesce((p_payload->>'cost_cents')::bigint,0),coalesce((p_payload->>'consumption_per_unit')::numeric,0),coalesce((p_payload->>'active')::boolean,true)) returning * into v_supply;
    if v_initial>0 then insert into public.supply_movements(supply_id,movement_type,quantity,unit_cost_cents,reference_id,user_id,operation_id) values(v_supply.id,'adjustment',v_initial,v_supply.cost_cents,p_supply_id,v_actor.id,p_operation_id); end if;
  else
    update public.supplies set name=trim(p_payload->>'name'),category=coalesce(p_payload->>'category',category),unit=coalesce(p_payload->>'unit',unit),minimum_stock=coalesce((p_payload->>'minimum_stock')::numeric,minimum_stock),cost_cents=coalesce((p_payload->>'cost_cents')::bigint,cost_cents),consumption_per_unit=coalesce((p_payload->>'consumption_per_unit')::numeric,consumption_per_unit),active=coalesce((p_payload->>'active')::boolean,active),updated_at=now() where id=p_supply_id returning * into v_supply;
  end if;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,before_data,after_data) values(v_actor.id,p_device_id,case when v_is_new then 'supply_created' else 'supply_updated' end,'supply',v_supply.id,v_before,to_jsonb(v_supply));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('supply',to_jsonb(v_supply)));
end;
$$;

create or replace function public.register_supply_movement(
  p_operation_id uuid, p_device_id uuid, p_reference_id uuid, p_supply_id uuid, p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_supply public.supplies; v_movement public.supply_movements; v_type text; v_qty numeric; v_delta numeric; v_target numeric; v_unit_cost bigint; v_total bigint; v_expense_id uuid; v_session public.cash_sessions; v_cached jsonb;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('supplies') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  select * into v_supply from public.supplies where id=p_supply_id for update;
  if v_supply.id is null then raise exception 'supply_not_found' using errcode='P0002'; end if;
  v_type:=p_payload->>'movement_type'; v_qty:=coalesce((p_payload->>'quantity')::numeric,0); v_unit_cost:=coalesce((p_payload->>'unit_cost_cents')::bigint,v_supply.cost_cents);
  if v_type='adjustment' then v_target:=v_qty; v_delta:=v_target-v_supply.current_stock;
  elsif v_type='consumption' or v_type='loss' then v_delta:=-v_qty;
  elsif v_type='purchase' then v_delta:=v_qty;
  else raise exception 'invalid_supply_movement_type' using errcode='22023'; end if;
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'register_supply_movement',jsonb_build_object('reference_id',p_reference_id,'supply_id',p_supply_id,'payload',p_payload));
  if v_cached is not null then return v_cached; end if;
  if (v_type<>'adjustment' and v_qty<=0) or v_supply.current_stock+v_delta<0 then raise exception 'invalid_supply_quantity' using errcode='23514'; end if;
  if length(trim(coalesce(p_payload->>'reason','')))=0 then raise exception 'movement_reason_required' using errcode='22023'; end if;
  if v_type='purchase' then
    v_total:=v_qty::bigint*v_unit_cost; v_expense_id:=coalesce(nullif(p_payload->>'expense_id','')::uuid,gen_random_uuid());
    if coalesce((p_payload->>'affects_cash')::boolean,false) and p_payload->>'payment_method'='efectivo' then
      select * into v_session from public.cash_sessions where id=nullif(p_payload->>'cash_session_id','')::uuid for update;
      if v_session.id is null or v_session.status<>'open' or v_session.user_id<>v_actor.id then raise exception 'cash_session_required' using errcode='42501'; end if;
      if v_total>app_private.cash_expected_cents(v_session.id) then raise exception 'insufficient_cash' using errcode='23514'; end if;
    end if;
    insert into public.expenses(id,concept,amount_cents,center,payment_method,affects_cash,cash_session_id,notes,user_id,operation_id,occurred_at)
    values(v_expense_id,'Compra de insumo: '||v_supply.name,v_total,v_actor.center,coalesce(p_payload->>'payment_method','otro'),coalesce((p_payload->>'affects_cash')::boolean,false),nullif(p_payload->>'cash_session_id','')::uuid,coalesce(p_payload->>'reason',''),v_actor.id,p_operation_id,now());
    if coalesce((p_payload->>'affects_cash')::boolean,false) and p_payload->>'payment_method'='efectivo' then
      insert into public.cash_movements(cash_session_id,movement_type,direction,amount_cents,reference_type,reference_id,user_id,operation_id) values(v_session.id,'cash_expense','out',v_total,'expense',v_expense_id,v_actor.id,p_operation_id);
    end if;
  end if;
  update public.supplies set current_stock=current_stock+v_delta,cost_cents=case when v_type='purchase' then v_unit_cost else cost_cents end,updated_at=now() where id=v_supply.id returning * into v_supply;
  insert into public.supply_movements(supply_id,movement_type,quantity,unit_cost_cents,reference_id,user_id,operation_id) values(v_supply.id,v_type,v_delta,v_unit_cost,p_reference_id,v_actor.id,p_operation_id) returning * into v_movement;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data,reason) values(v_actor.id,p_device_id,'supply_movement_created','supply',v_supply.id,jsonb_build_object('supply',to_jsonb(v_supply),'movement',to_jsonb(v_movement)),p_payload->>'reason');
  return app_private.complete_operation(p_operation_id,jsonb_build_object('supply',to_jsonb(v_supply),'movement',to_jsonb(v_movement)));
end;
$$;

create or replace function public.fill_containers(
  p_operation_id uuid, p_device_id uuid, p_reference_id uuid, p_quantity integer, p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_wash public.inventory_locations; v_local public.inventory_locations; v_supply public.supplies; v_cached jsonb; v_needed numeric;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not (app_private.can_operate('rounds') or app_private.can_operate('supplies')) then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  if p_quantity<=0 then raise exception 'invalid_fill_quantity' using errcode='22023'; end if;
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'fill_containers',jsonb_build_object('reference_id',p_reference_id,'quantity',p_quantity,'notes',coalesce(p_notes,'')));
  if v_cached is not null then return v_cached; end if;
  select * into v_wash from public.inventory_locations where id=app_private.inventory_location_id('lavado') for update;
  select * into v_local from public.inventory_locations where id=app_private.inventory_location_id('local') for update;
  if v_wash.quantity<p_quantity then raise exception 'insufficient_empty_inventory' using errcode='23514'; end if;
  for v_supply in select * from public.supplies where active and consumption_per_unit>0 order by id for update loop
    v_needed:=v_supply.consumption_per_unit*p_quantity;
    if v_supply.current_stock<v_needed then raise exception 'insufficient_supply:%',v_supply.name using errcode='23514'; end if;
  end loop;
  update public.inventory_locations set quantity=quantity-p_quantity,updated_at=now() where id=v_wash.id;
  update public.inventory_locations set quantity=quantity+p_quantity,updated_at=now() where id=v_local.id;
  insert into public.inventory_movements(container_type,from_location_id,quantity,movement_type,reference_type,reference_id,user_id,operation_id) values('empty',v_wash.id,p_quantity,'containers_filled_empty','production',p_reference_id,v_actor.id,p_operation_id);
  insert into public.inventory_movements(container_type,to_location_id,quantity,movement_type,reference_type,reference_id,user_id,operation_id) values('full',v_local.id,p_quantity,'containers_filled_full','production',p_reference_id,v_actor.id,p_operation_id);
  for v_supply in select * from public.supplies where active and consumption_per_unit>0 order by id for update loop
    v_needed:=v_supply.consumption_per_unit*p_quantity;
    update public.supplies set current_stock=current_stock-v_needed,updated_at=now() where id=v_supply.id;
    insert into public.supply_movements(supply_id,movement_type,quantity,unit_cost_cents,reference_id,user_id,operation_id) values(v_supply.id,'consumption',-v_needed,v_supply.cost_cents,p_reference_id,v_actor.id,p_operation_id);
  end loop;
  insert into public.maintenance_events(id,event_type,quantity,notes,user_id,operation_id) values(p_reference_id,'production',p_quantity,coalesce(p_notes,''),v_actor.id,p_operation_id);
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data,reason) values(v_actor.id,p_device_id,'containers_filled','inventory',p_reference_id,jsonb_build_object('quantity',p_quantity),coalesce(p_notes,''));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('reference_id',p_reference_id,'quantity',p_quantity));
end;
$$;

create or replace function public.update_operational_settings(
  p_operation_id uuid, p_device_id uuid, p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_cached jsonb;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('settings') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  if coalesce((p_payload->>'default_price_cents')::bigint,0)<0 or coalesce((p_payload->>'maintenance_threshold')::integer,1)<1 then raise exception 'invalid_settings' using errcode='22023'; end if;
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'update_operational_settings',p_payload);
  if v_cached is not null then return v_cached; end if;
  insert into public.settings(key,value,updated_by,updated_at) values
    ('business',jsonb_build_object('name',coalesce(p_payload->>'business_name','Purificadora Trujillo'),'currency','MXN'),v_actor.id,now()),
    ('pricing',jsonb_build_object('default_price_cents',(p_payload->>'default_price_cents')::bigint),v_actor.id,now()),
    ('maintenance',jsonb_build_object('threshold',(p_payload->>'maintenance_threshold')::integer),v_actor.id,now())
  on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.audit_log(user_id,device_id,action,entity,after_data) values(v_actor.id,p_device_id,'settings_updated','settings',p_payload);
  return app_private.complete_operation(p_operation_id,jsonb_build_object('settings',p_payload));
end;
$$;

revoke execute on function public.upsert_supply(uuid,uuid,uuid,jsonb) from public,anon;
revoke execute on function public.register_supply_movement(uuid,uuid,uuid,uuid,jsonb) from public,anon;
revoke execute on function public.fill_containers(uuid,uuid,uuid,integer,text) from public,anon;
revoke execute on function public.update_operational_settings(uuid,uuid,jsonb) from public,anon;
grant execute on function public.upsert_supply(uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.register_supply_movement(uuid,uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.fill_containers(uuid,uuid,uuid,integer,text) to authenticated;
grant execute on function public.update_operational_settings(uuid,uuid,jsonb) to authenticated;
