-- Simplified, append-only container flow.
-- Existing wash data remains intact; new production uses local empty stock.

alter table public.sales
  add column if not exists empty_return_quantity integer,
  add column if not exists damaged_return_quantity integer not null default 0;

alter table public.sales
  drop constraint if exists sales_empty_return_quantity_check,
  drop constraint if exists sales_damaged_return_quantity_check;
alter table public.sales
  add constraint sales_empty_return_quantity_check
    check (empty_return_quantity is null or empty_return_quantity >= 0),
  add constraint sales_damaged_return_quantity_check
    check (damaged_return_quantity >= 0);

create or replace function app_private.sale_empty_location_id(p_channel text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app_private.inventory_location_id(case
    when p_channel in ('ventanilla','fuera_ruta','fuera_horario') then 'empty_local'
    when p_channel='ruta1' then 'empty_ruta1'
    when p_channel='ruta2' then 'empty_ruta2'
  end)
$$;
revoke all on function app_private.sale_empty_location_id(text) from public, anon, authenticated;

create or replace function app_private.prepare_sale_container_effect()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empty text := nullif(current_setting('app.sale_empty_return_quantity', true), '');
  v_damaged text := nullif(current_setting('app.sale_damaged_return_quantity', true), '');
begin
  new.empty_return_quantity := coalesce(v_empty::integer, new.empty_return_quantity, new.quantity);
  new.damaged_return_quantity := coalesce(v_damaged::integer, new.damaged_return_quantity, 0);
  if new.empty_return_quantity < 0 or new.damaged_return_quantity < 0 then
    raise exception 'invalid_container_exchange' using errcode='22023';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_prepare_container_effect on public.sales;
create trigger sales_prepare_container_effect
before insert on public.sales
for each row execute function app_private.prepare_sale_container_effect();

create or replace function app_private.apply_sale_container_effect()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empty public.inventory_locations;
  v_damaged public.inventory_locations;
begin
  if new.empty_return_quantity > 0 then
    select * into v_empty from public.inventory_locations
    where id=app_private.sale_empty_location_id(new.channel) for update;
    if v_empty.id is null then raise exception 'empty_inventory_location_missing' using errcode='P0002'; end if;
    update public.inventory_locations set quantity=quantity+new.empty_return_quantity,updated_at=now() where id=v_empty.id;
    insert into public.inventory_movements(container_type,to_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id)
    values('empty',v_empty.id,new.empty_return_quantity,'sale_empty_received','sale',new.id,new.round_id,new.user_id,new.operation_id);
  end if;
  if new.damaged_return_quantity > 0 then
    select * into v_damaged from public.inventory_locations
    where id=app_private.inventory_location_id('danados') for update;
    update public.inventory_locations set quantity=quantity+new.damaged_return_quantity,updated_at=now() where id=v_damaged.id;
    insert into public.inventory_movements(container_type,to_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id)
    values('damaged',v_damaged.id,new.damaged_return_quantity,'sale_damaged_received','sale',new.id,new.round_id,new.user_id,new.operation_id);
  end if;
  return new;
end;
$$;

drop trigger if exists sales_apply_container_effect on public.sales;
create trigger sales_apply_container_effect
after insert on public.sales
for each row execute function app_private.apply_sale_container_effect();

create or replace function app_private.reverse_sale_container_effect(
  p_sale public.sales,
  p_quantity integer,
  p_operation_id uuid,
  p_reference_type text,
  p_reference_id uuid,
  p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_prior integer;
  v_empty_qty integer;
  v_damaged_qty integer;
  v_empty public.inventory_locations;
  v_damaged public.inventory_locations;
begin
  select coalesce(sum(quantity),0)::integer into v_prior from public.sale_returns where sale_id=p_sale.id and id<>p_reference_id;
  v_empty_qty := round(coalesce(p_sale.empty_return_quantity,p_sale.quantity)::numeric*(v_prior+p_quantity)::numeric/p_sale.quantity::numeric)::integer
    - round(coalesce(p_sale.empty_return_quantity,p_sale.quantity)::numeric*v_prior::numeric/p_sale.quantity::numeric)::integer;
  v_damaged_qty := round(coalesce(p_sale.damaged_return_quantity,0)::numeric*(v_prior+p_quantity)::numeric/p_sale.quantity::numeric)::integer
    - round(coalesce(p_sale.damaged_return_quantity,0)::numeric*v_prior::numeric/p_sale.quantity::numeric)::integer;
  if v_empty_qty > 0 then
    select * into v_empty from public.inventory_locations where id=app_private.sale_empty_location_id(p_sale.channel) for update;
    if v_empty.quantity < v_empty_qty then raise exception 'insufficient_empty_inventory_for_reversal' using errcode='23514'; end if;
    update public.inventory_locations set quantity=quantity-v_empty_qty,updated_at=now() where id=v_empty.id;
    insert into public.inventory_movements(container_type,from_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id)
    values('empty',v_empty.id,v_empty_qty,'sale_empty_reversal',p_reference_type,p_reference_id,p_sale.round_id,p_actor_id,p_operation_id);
  end if;
  if v_damaged_qty > 0 then
    select * into v_damaged from public.inventory_locations where id=app_private.inventory_location_id('danados') for update;
    if v_damaged.quantity < v_damaged_qty then raise exception 'insufficient_damaged_inventory_for_reversal' using errcode='23514'; end if;
    update public.inventory_locations set quantity=quantity-v_damaged_qty,updated_at=now() where id=v_damaged.id;
    insert into public.inventory_movements(container_type,from_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id)
    values('damaged',v_damaged.id,v_damaged_qty,'sale_damaged_reversal',p_reference_type,p_reference_id,p_sale.round_id,p_actor_id,p_operation_id);
  end if;
end;
$$;
revoke all on function app_private.reverse_sale_container_effect(public.sales,integer,uuid,text,uuid,uuid) from public, anon, authenticated;

create or replace function app_private.reverse_containers_on_return()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_sale public.sales;
begin
  select * into v_sale from public.sales where id=new.sale_id for update;
  perform app_private.reverse_sale_container_effect(v_sale,new.quantity,new.operation_id,'sale_return',new.id,new.user_id);
  return new;
end;
$$;
drop trigger if exists sale_returns_reverse_containers on public.sale_returns;
create trigger sale_returns_reverse_containers after insert on public.sale_returns
for each row execute function app_private.reverse_containers_on_return();

create or replace function app_private.reverse_containers_on_correction()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_sale public.sales;
begin
  select * into v_sale from public.sales where id=new.original_sale_id for update;
  perform app_private.reverse_sale_container_effect(v_sale,v_sale.quantity,new.operation_id,'sale_correction',new.id,new.created_by);
  return new;
end;
$$;
drop trigger if exists sale_corrections_reverse_containers on public.sale_corrections;
create trigger sale_corrections_reverse_containers after insert on public.sale_corrections
for each row execute function app_private.reverse_containers_on_correction();

create or replace function public.register_sale_with_containers(
  p_operation_id uuid,p_device_id uuid,p_sale_id uuid,p_payload jsonb
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  perform set_config('app.sale_empty_return_quantity',coalesce(p_payload->>'empty_return_quantity',p_payload->>'quantity'),true);
  perform set_config('app.sale_damaged_return_quantity',coalesce(p_payload->>'damaged_return_quantity','0'),true);
  return public.register_sale(p_operation_id,p_device_id,p_sale_id,p_payload);
end;
$$;
revoke all on function public.register_sale_with_containers(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.register_sale_with_containers(uuid,uuid,uuid,jsonb) to authenticated;

create or replace function public.correct_sale_with_containers(
  p_operation_id uuid,p_device_id uuid,p_correction_id uuid,p_replacement_sale_id uuid,p_original_sale_id uuid,p_payload jsonb
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  perform set_config('app.sale_empty_return_quantity',coalesce(p_payload->>'empty_return_quantity',p_payload->>'quantity'),true);
  perform set_config('app.sale_damaged_return_quantity',coalesce(p_payload->>'damaged_return_quantity','0'),true);
  return public.correct_sale(p_operation_id,p_device_id,p_correction_id,p_replacement_sale_id,p_original_sale_id,p_payload);
end;
$$;
revoke all on function public.correct_sale_with_containers(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.correct_sale_with_containers(uuid,uuid,uuid,uuid,uuid,jsonb) to authenticated;

-- Production now consumes Local empty containers, while legacy wash stock remains untouched.
create or replace function public.fill_containers(
  p_operation_id uuid,p_device_id uuid,p_reference_id uuid,p_quantity integer,p_notes text default ''
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_actor public.profiles; v_empty public.inventory_locations; v_local public.inventory_locations; v_supply public.supplies; v_cached jsonb; v_needed numeric;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not (app_private.can_operate('rounds') or app_private.can_operate('supplies')) then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'fill_containers',jsonb_build_object('reference_id',p_reference_id,'quantity',p_quantity,'notes',p_notes));
  if v_cached is not null then return v_cached; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'invalid_fill_quantity' using errcode='22023'; end if;
  select * into v_empty from public.inventory_locations where id=app_private.inventory_location_id('empty_local') for update;
  select * into v_local from public.inventory_locations where id=app_private.inventory_location_id('local') for update;
  if v_empty.quantity<p_quantity then raise exception 'insufficient_empty_inventory' using errcode='23514'; end if;
  for v_supply in select * from public.supplies where active and consumption_per_unit>0 order by id for update loop
    v_needed:=v_supply.consumption_per_unit*p_quantity;
    if v_supply.current_stock<v_needed then raise exception 'insufficient_supply:%',v_supply.name using errcode='23514'; end if;
  end loop;
  update public.inventory_locations set quantity=quantity-p_quantity,updated_at=now() where id=v_empty.id;
  update public.inventory_locations set quantity=quantity+p_quantity,updated_at=now() where id=v_local.id;
  insert into public.inventory_movements(container_type,from_location_id,quantity,movement_type,reference_type,reference_id,user_id,operation_id)
  values('empty',v_empty.id,p_quantity,'containers_prepared_empty','production',p_reference_id,v_actor.id,p_operation_id);
  insert into public.inventory_movements(container_type,to_location_id,quantity,movement_type,reference_type,reference_id,user_id,operation_id)
  values('full',v_local.id,p_quantity,'containers_prepared_full','production',p_reference_id,v_actor.id,p_operation_id);
  for v_supply in select * from public.supplies where active and consumption_per_unit>0 order by id for update loop
    v_needed:=v_supply.consumption_per_unit*p_quantity;
    update public.supplies set current_stock=current_stock-v_needed,updated_at=now() where id=v_supply.id;
    insert into public.supply_movements(supply_id,movement_type,quantity,unit_cost_cents,reference_id,user_id,operation_id)
    values(v_supply.id,'consumption',-v_needed,v_supply.cost_cents,p_reference_id,v_actor.id,p_operation_id);
  end loop;
  insert into public.maintenance_events(id,event_type,quantity,notes,user_id,operation_id)
  values(p_reference_id,'production',p_quantity,coalesce(p_notes,''),v_actor.id,p_operation_id);
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data,reason)
  values(v_actor.id,p_device_id,'containers_prepared','inventory',p_reference_id,jsonb_build_object('quantity',p_quantity,'empty_source','local'),coalesce(p_notes,''));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('quantity',p_quantity,'reference_id',p_reference_id));
end;
$$;
revoke all on function public.fill_containers(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.fill_containers(uuid,uuid,uuid,integer,text) to authenticated;

-- Convert legacy round-return writes into Route empty -> Local empty in the same transaction.
create or replace function app_private.redirect_round_return_empty()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_round public.rounds; v_wash public.inventory_locations; v_route_empty public.inventory_locations; v_local_empty public.inventory_locations;
begin
  if new.movement_type<>'empty_returned' or new.reference_type<>'round' then return new; end if;
  select * into v_round from public.rounds where id=new.round_id;
  select * into v_wash from public.inventory_locations where id=app_private.inventory_location_id('lavado') for update;
  select * into v_route_empty from public.inventory_locations where id=app_private.inventory_location_id('empty_'||v_round.route) for update;
  select * into v_local_empty from public.inventory_locations where id=app_private.inventory_location_id('empty_local') for update;
  if v_route_empty.quantity<new.quantity then raise exception 'insufficient_route_empty_inventory' using errcode='23514'; end if;
  update public.inventory_locations set quantity=quantity-new.quantity,updated_at=now() where id=v_wash.id;
  update public.inventory_locations set quantity=quantity-new.quantity,updated_at=now() where id=v_route_empty.id;
  update public.inventory_locations set quantity=quantity+new.quantity,updated_at=now() where id=v_local_empty.id;
  insert into public.inventory_movements(container_type,from_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id)
  values('empty',v_wash.id,new.quantity,'round_return_legacy_wash_cancel','round',new.reference_id,new.round_id,new.user_id,new.operation_id);
  insert into public.inventory_movements(container_type,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id)
  values('empty',v_route_empty.id,v_local_empty.id,new.quantity,'round_return_empty','round',new.reference_id,new.round_id,new.user_id,new.operation_id);
  return new;
end;
$$;
drop trigger if exists inventory_redirect_round_return_empty on public.inventory_movements;
create trigger inventory_redirect_round_return_empty after insert on public.inventory_movements
for each row when (new.movement_type='empty_returned' and new.reference_type='round')
execute function app_private.redirect_round_return_empty();

notify pgrst, 'reload schema';
