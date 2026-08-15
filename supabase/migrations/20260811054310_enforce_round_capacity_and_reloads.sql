-- Rounds have a documentary capacity independent from the aggregate route
-- location. A sale can consume only the stock assigned to its own round.
create or replace function app_private.round_capacity(p_round_id uuid)
returns table (
  initial_load integer,
  reloads integer,
  total_loaded integer,
  net_sold integer,
  available_full integer
)
language sql
volatile
set search_path = pg_catalog, public
as $$
  with selected_round as (
    select r.loaded_full_qty
    from public.rounds r
    where r.id = p_round_id
  ), reload_totals as (
    select coalesce(sum(im.quantity), 0)::integer as quantity
    from public.inventory_movements im
    where im.round_id = p_round_id
      and im.movement_type = 'round_reload'
      and im.container_type = 'full'
  ), return_totals as (
    select sr.sale_id, sum(sr.quantity)::integer as quantity
    from public.sale_returns sr
    join public.sales sale on sale.id = sr.sale_id
    where sale.round_id = p_round_id
    group by sr.sale_id
  ), sale_totals as (
    select coalesce(sum(s.quantity - coalesce(rt.quantity, 0)), 0)::integer as quantity
    from public.sales s
    left join return_totals rt on rt.sale_id = s.id
    where s.round_id = p_round_id
      and s.status = 'active'
  )
  select
    r.loaded_full_qty,
    re.quantity,
    r.loaded_full_qty + re.quantity,
    so.quantity,
    r.loaded_full_qty + re.quantity - so.quantity
  from selected_round r
  cross join reload_totals re
  cross join sale_totals so;
$$;

revoke all on function app_private.round_capacity(uuid) from public, anon, authenticated;

-- The trigger is part of the register_sale/correct_sale transaction. Locking
-- the round serializes concurrent sales and reloads, so two devices cannot
-- consume the same remaining unit.
create or replace function app_private.enforce_round_sale_capacity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_round public.rounds;
  v_capacity record;
begin
  if new.channel not in ('ruta1', 'ruta2') then
    return new;
  end if;

  if new.round_id is null then
    raise exception 'active_round_required' using errcode = '23514';
  end if;

  select * into v_round
  from public.rounds
  where id = new.round_id
  for update;

  if v_round.id is null or v_round.route <> new.channel then
    raise exception 'invalid_round_scope' using errcode = '42501';
  end if;

  if v_round.status not in ('preparing', 'active')
     and new.original_sale_id is null then
    raise exception 'active_round_required' using errcode = '23514';
  end if;

  select * into v_capacity
  from app_private.round_capacity(v_round.id);

  if v_capacity.available_full < 0 then
    raise exception 'round_integrity_inconsistent'
      using errcode = '23514',
            detail = format(
              'round_id=%s oversold=%s',
              v_round.id,
              abs(v_capacity.available_full)
            );
  end if;

  if new.quantity > v_capacity.available_full then
    raise exception 'round_capacity_exceeded'
      using errcode = '23514',
            detail = format(
              'round_id=%s requested=%s available=%s',
              v_round.id,
              new.quantity,
              v_capacity.available_full
            );
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_round_sale_capacity() from public, anon, authenticated;

drop trigger if exists enforce_round_sale_capacity on public.sales;
create trigger enforce_round_sale_capacity
before insert on public.sales
for each row execute function app_private.enforce_round_sale_capacity();

create or replace function public.reload_round(
  p_operation_id uuid,
  p_device_id uuid,
  p_round_id uuid,
  p_quantity integer,
  p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_round public.rounds;
  v_local public.inventory_locations;
  v_route public.inventory_locations;
  v_cached jsonb;
  v_payload jsonb;
  v_capacity record;
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id();

  if v_actor.id is null or not app_private.can_operate('rounds') then
    raise exception 'operation_not_authorized' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_round_reload' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'round_id', p_round_id,
    'quantity', p_quantity,
    'notes', coalesce(p_notes, '')
  );
  v_cached := app_private.claim_operation(
    p_operation_id,
    p_device_id,
    'reload_round',
    v_payload
  );
  if v_cached is not null then return v_cached; end if;

  select * into v_round
  from public.rounds
  where id = p_round_id
  for update;

  if v_round.id is null or v_round.status not in ('preparing', 'active') then
    raise exception 'round_not_open' using errcode = '55000';
  end if;
  if v_actor.role = 'repartidor'
     and (v_round.user_id <> v_actor.id or v_round.route <> v_actor.route) then
    raise exception 'route_scope_violation' using errcode = '42501';
  end if;

  select * into v_local
  from public.inventory_locations
  where id = app_private.inventory_location_id('local')
  for update;
  select * into v_route
  from public.inventory_locations
  where id = app_private.inventory_location_id(v_round.route)
  for update;

  if v_local.quantity < p_quantity then
    raise exception 'insufficient_inventory' using errcode = '23514';
  end if;

  update public.inventory_locations
  set quantity = quantity - p_quantity, updated_at = now()
  where id = v_local.id;
  update public.inventory_locations
  set quantity = quantity + p_quantity, updated_at = now()
  where id = v_route.id;

  insert into public.inventory_movements(
    container_type, from_location_id, to_location_id, quantity,
    movement_type, reference_type, reference_id, round_id,
    user_id, operation_id
  ) values (
    'full', v_local.id, v_route.id, p_quantity,
    'round_reload', 'round', v_round.id, v_round.id,
    v_actor.id, p_operation_id
  );

  select * into v_capacity
  from app_private.round_capacity(v_round.id);

  insert into public.audit_log(
    user_id, device_id, action, entity, entity_id, after_data, reason
  ) values (
    v_actor.id, p_device_id, 'round_reloaded', 'round', v_round.id,
    jsonb_build_object(
      'quantity', p_quantity,
      'reloads', v_capacity.reloads,
      'available_full', v_capacity.available_full
    ),
    nullif(trim(coalesce(p_notes, '')), '')
  );

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object(
      'round', to_jsonb(v_round),
      'quantity', p_quantity,
      'capacity', to_jsonb(v_capacity)
    )
  );
end;
$$;

revoke all on function public.reload_round(uuid,uuid,uuid,integer,text)
from public, anon, authenticated;
grant execute on function public.reload_round(uuid,uuid,uuid,integer,text)
to authenticated;

-- Closing uses the same net capacity formula and refuses to hide an existing
-- over-sale with a zero clamp.
create or replace function public.close_round(
  p_operation_id uuid, p_device_id uuid, p_round_id uuid,
  p_returned_full integer, p_returned_empty integer,
  p_damaged integer, p_lost integer, p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_round public.rounds;
  v_route public.inventory_locations;
  v_local public.inventory_locations;
  v_wash public.inventory_locations;
  v_damaged_loc public.inventory_locations;
  v_capacity record;
  v_expected integer;
  v_cached jsonb;
  v_payload jsonb;
begin
  select * into v_actor from public.profiles
  where id = app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('rounds') then
    raise exception 'operation_not_authorized' using errcode = '42501';
  end if;
  if least(p_returned_full,p_returned_empty,p_damaged,p_lost) < 0 then
    raise exception 'invalid_round_return' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'round_id',p_round_id,'returned_full',p_returned_full,
    'returned_empty',p_returned_empty,'damaged',p_damaged,'lost',p_lost,
    'notes',coalesce(p_notes,'')
  );
  v_cached := app_private.claim_operation(
    p_operation_id,p_device_id,'close_round',v_payload
  );
  if v_cached is not null then return v_cached; end if;

  select * into v_round from public.rounds
  where id = p_round_id for update;
  if v_round.id is null or v_round.status = 'closed' then
    raise exception 'round_not_open' using errcode = '55000';
  end if;
  if v_actor.role = 'repartidor'
     and (v_round.user_id <> v_actor.id or v_round.route <> v_actor.route) then
    raise exception 'route_scope_violation' using errcode = '42501';
  end if;

  select * into v_capacity
  from app_private.round_capacity(v_round.id);
  v_expected := v_capacity.available_full;

  if v_expected < 0 then
    raise exception 'round_integrity_inconsistent'
      using errcode = '23514',
            detail = format('round_id=%s oversold=%s',v_round.id,abs(v_expected));
  end if;
  if p_returned_full + p_damaged + p_lost <> v_expected then
    raise exception 'round_return_mismatch' using errcode = '23514';
  end if;

  select * into v_route from public.inventory_locations
  where id = app_private.inventory_location_id(v_round.route) for update;
  select * into v_local from public.inventory_locations
  where id = app_private.inventory_location_id('local') for update;
  select * into v_wash from public.inventory_locations
  where id = app_private.inventory_location_id('lavado') for update;
  select * into v_damaged_loc from public.inventory_locations
  where id = app_private.inventory_location_id('danados') for update;

  if v_route.quantity < p_returned_full + p_damaged + p_lost then
    raise exception 'insufficient_route_inventory' using errcode = '23514';
  end if;

  update public.inventory_locations
  set quantity=quantity-(p_returned_full+p_damaged+p_lost),updated_at=now()
  where id=v_route.id;
  update public.inventory_locations
  set quantity=quantity+p_returned_full,updated_at=now()
  where id=v_local.id;
  update public.inventory_locations
  set quantity=quantity+p_returned_empty,updated_at=now()
  where id=v_wash.id;
  update public.inventory_locations
  set quantity=quantity+p_damaged,updated_at=now()
  where id=v_damaged_loc.id;

  if p_returned_full > 0 then
    insert into public.inventory_movements(
      container_type,from_location_id,to_location_id,quantity,movement_type,
      reference_type,reference_id,round_id,user_id,operation_id
    ) values (
      'full',v_route.id,v_local.id,p_returned_full,'round_return_full',
      'round',v_round.id,v_round.id,v_actor.id,p_operation_id
    );
  end if;
  if p_damaged > 0 then
    insert into public.inventory_movements(
      container_type,from_location_id,quantity,movement_type,reference_type,
      reference_id,round_id,user_id,operation_id
    ) values (
      'full',v_route.id,p_damaged,'round_damaged_out','round',v_round.id,
      v_round.id,v_actor.id,p_operation_id
    );
    insert into public.inventory_movements(
      container_type,to_location_id,quantity,movement_type,reference_type,
      reference_id,round_id,user_id,operation_id
    ) values (
      'damaged',v_damaged_loc.id,p_damaged,'round_damaged_in','round',
      v_round.id,v_round.id,v_actor.id,p_operation_id
    );
  end if;
  if p_lost > 0 then
    insert into public.inventory_movements(
      container_type,from_location_id,quantity,movement_type,reference_type,
      reference_id,round_id,user_id,operation_id
    ) values (
      'full',v_route.id,p_lost,'round_lost','round',v_round.id,v_round.id,
      v_actor.id,p_operation_id
    );
  end if;
  if p_returned_empty > 0 then
    insert into public.inventory_movements(
      container_type,to_location_id,quantity,movement_type,reference_type,
      reference_id,round_id,user_id,operation_id
    ) values (
      'empty',v_wash.id,p_returned_empty,'empty_returned','round',v_round.id,
      v_round.id,v_actor.id,p_operation_id
    );
  end if;

  update public.rounds set
    returned_at=now(),closed_at=now(),returned_full_qty=p_returned_full,
    returned_empty_qty=p_returned_empty,damaged_qty=p_damaged,lost_qty=p_lost,
    status='closed',close_operation_id=p_operation_id
  where id=v_round.id returning * into v_round;

  insert into public.audit_log(
    user_id,device_id,action,entity,entity_id,after_data,reason
  ) values (
    v_actor.id,p_device_id,'round_closed','round',v_round.id,
    jsonb_build_object(
      'round',to_jsonb(v_round),
      'initial_load',v_capacity.initial_load,
      'reloads',v_capacity.reloads,
      'total_loaded',v_capacity.total_loaded,
      'net_sold',v_capacity.net_sold,
      'expected_full',v_expected
    ),coalesce(p_notes,'')
  );

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object(
      'round',to_jsonb(v_round),
      'initial_load',v_capacity.initial_load,
      'reloads',v_capacity.reloads,
      'total_loaded',v_capacity.total_loaded,
      'net_sold_quantity',v_capacity.net_sold,
      'expected_full_quantity',v_expected
    )
  );
end;
$$;

revoke all on function public.close_round(uuid,uuid,uuid,integer,integer,integer,integer,text)
from public, anon, authenticated;
grant execute on function public.close_round(uuid,uuid,uuid,integer,integer,integer,integer,text)
to authenticated;
