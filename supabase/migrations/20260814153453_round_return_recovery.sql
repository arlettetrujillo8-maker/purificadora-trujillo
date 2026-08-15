alter table public.rounds
  add column if not exists return_operation_id uuid unique
    references public.operations(id) on delete restrict,
  add column if not exists closed_by uuid
    references public.profiles(id) on delete restrict,
  add column if not exists return_notes text not null default '',
  add column if not exists recovery_reason text not null default '';

create or replace function public.register_round_return(
  p_operation_id uuid,
  p_device_id uuid,
  p_round_id uuid,
  p_returned_full integer,
  p_returned_empty integer,
  p_damaged integer,
  p_notes text default '',
  p_recovery_reason text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_round public.rounds;
  v_before jsonb;
  v_route public.inventory_locations;
  v_local public.inventory_locations;
  v_wash public.inventory_locations;
  v_damaged_loc public.inventory_locations;
  v_capacity record;
  v_expected integer;
  v_oversold integer;
  v_cached jsonb;
  v_payload jsonb;
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id();

  if v_actor.id is null or not app_private.can_operate('rounds') then
    raise exception 'operation_not_authorized' using errcode = '42501';
  end if;
  if least(p_returned_full, p_returned_empty, p_damaged) < 0 then
    raise exception 'invalid_round_return' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'round_id', p_round_id,
    'returned_full', p_returned_full,
    'returned_empty', p_returned_empty,
    'damaged', p_damaged,
    'notes', coalesce(p_notes, ''),
    'recovery_reason', coalesce(p_recovery_reason, '')
  );
  v_cached := app_private.claim_operation(
    p_operation_id, p_device_id, 'register_round_return', v_payload
  );
  if v_cached is not null then return v_cached; end if;

  select * into v_round
  from public.rounds
  where id = p_round_id
  for update;

  if v_round.id is null then
    raise exception 'round_not_found' using errcode = 'P0002';
  end if;
  if v_round.status = 'returned' then
    raise exception 'round_return_already_registered' using errcode = '55000';
  end if;
  if v_round.status = 'closed' then
    raise exception 'round_already_closed' using errcode = '55000';
  end if;
  if v_actor.role = 'repartidor'
     and (v_round.user_id <> v_actor.id or v_round.route <> v_actor.route) then
    raise exception 'route_scope_violation' using errcode = '42501';
  end if;

  select * into v_capacity
  from app_private.round_capacity(v_round.id);
  v_expected := v_capacity.available_full;
  v_oversold := greatest(0, -v_expected);

  if v_expected < 0 then
    if v_actor.role <> 'administrador' then
      raise exception 'round_recovery_admin_required' using errcode = '42501';
    end if;
    if length(trim(coalesce(p_recovery_reason, ''))) = 0 then
      raise exception 'round_recovery_reason_required' using errcode = '22023';
    end if;
  elsif p_returned_full + p_damaged <> v_expected then
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

  if v_route.quantity < p_returned_full + p_damaged then
    raise exception 'insufficient_route_inventory' using errcode = '23514';
  end if;

  v_before := to_jsonb(v_round);

  update public.inventory_locations
  set quantity = quantity - (p_returned_full + p_damaged), updated_at = now()
  where id = v_route.id;
  update public.inventory_locations
  set quantity = quantity + p_returned_full, updated_at = now()
  where id = v_local.id;
  update public.inventory_locations
  set quantity = quantity + p_returned_empty, updated_at = now()
  where id = v_wash.id;
  update public.inventory_locations
  set quantity = quantity + p_damaged, updated_at = now()
  where id = v_damaged_loc.id;

  if p_returned_full > 0 then
    insert into public.inventory_movements(
      container_type, from_location_id, to_location_id, quantity,
      movement_type, reference_type, reference_id, round_id, user_id, operation_id
    ) values (
      'full', v_route.id, v_local.id, p_returned_full,
      'round_return_full', 'round', v_round.id, v_round.id, v_actor.id, p_operation_id
    );
  end if;
  if p_damaged > 0 then
    insert into public.inventory_movements(
      container_type, from_location_id, quantity, movement_type,
      reference_type, reference_id, round_id, user_id, operation_id
    ) values (
      'full', v_route.id, p_damaged, 'round_damaged_out',
      'round', v_round.id, v_round.id, v_actor.id, p_operation_id
    );
    insert into public.inventory_movements(
      container_type, to_location_id, quantity, movement_type,
      reference_type, reference_id, round_id, user_id, operation_id
    ) values (
      'damaged', v_damaged_loc.id, p_damaged, 'round_damaged_in',
      'round', v_round.id, v_round.id, v_actor.id, p_operation_id
    );
  end if;
  if p_returned_empty > 0 then
    insert into public.inventory_movements(
      container_type, to_location_id, quantity, movement_type,
      reference_type, reference_id, round_id, user_id, operation_id
    ) values (
      'empty', v_wash.id, p_returned_empty, 'empty_returned',
      'round', v_round.id, v_round.id, v_actor.id, p_operation_id
    );
  end if;

  update public.rounds set
    returned_at = now(),
    returned_full_qty = p_returned_full,
    returned_empty_qty = p_returned_empty,
    damaged_qty = p_damaged,
    lost_qty = 0,
    status = 'returned',
    return_operation_id = p_operation_id,
    return_notes = trim(coalesce(p_notes, '')),
    recovery_reason = trim(coalesce(p_recovery_reason, ''))
  where id = v_round.id
  returning * into v_round;

  insert into public.audit_log(
    user_id, device_id, action, entity, entity_id,
    before_data, after_data, reason
  ) values (
    v_actor.id, p_device_id,
    case when v_expected < 0 then 'round_return_recovered' else 'round_returned' end,
    'round', v_round.id, v_before,
    jsonb_build_object(
      'round', to_jsonb(v_round),
      'initial_load', v_capacity.initial_load,
      'reloads', v_capacity.reloads,
      'total_loaded', v_capacity.total_loaded,
      'net_sold', v_capacity.net_sold,
      'expected_full', greatest(0, v_expected),
      'oversold', v_oversold
    ),
    case when v_expected < 0 then trim(p_recovery_reason) else trim(coalesce(p_notes, '')) end
  );

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object(
      'round', to_jsonb(v_round),
      'initial_load', v_capacity.initial_load,
      'reloads', v_capacity.reloads,
      'total_loaded', v_capacity.total_loaded,
      'net_sold_quantity', v_capacity.net_sold,
      'expected_full_quantity', greatest(0, v_expected),
      'oversold_quantity', v_oversold
    )
  );
end;
$$;

create or replace function public.finalize_round_close(
  p_operation_id uuid,
  p_device_id uuid,
  p_round_id uuid,
  p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_round public.rounds;
  v_before jsonb;
  v_capacity record;
  v_cached jsonb;
  v_payload jsonb;
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('rounds') then
    raise exception 'operation_not_authorized' using errcode = '42501';
  end if;

  v_payload := jsonb_build_object(
    'round_id', p_round_id,
    'notes', coalesce(p_notes, '')
  );
  v_cached := app_private.claim_operation(
    p_operation_id, p_device_id, 'finalize_round_close', v_payload
  );
  if v_cached is not null then return v_cached; end if;

  select * into v_round
  from public.rounds
  where id = p_round_id
  for update;

  if v_round.id is null then
    raise exception 'round_not_found' using errcode = 'P0002';
  end if;
  if v_round.status = 'closed' then
    raise exception 'round_already_closed' using errcode = '55000';
  end if;
  if v_round.status <> 'returned' then
    raise exception 'round_return_required' using errcode = '55000';
  end if;
  if v_actor.role = 'repartidor'
     and (v_round.user_id <> v_actor.id or v_round.route <> v_actor.route) then
    raise exception 'route_scope_violation' using errcode = '42501';
  end if;

  v_before := to_jsonb(v_round);
  select * into v_capacity from app_private.round_capacity(v_round.id);

  update public.rounds set
    status = 'closed',
    closed_at = now(),
    closed_by = v_actor.id,
    close_operation_id = p_operation_id
  where id = v_round.id
  returning * into v_round;

  insert into public.audit_log(
    user_id, device_id, action, entity, entity_id,
    before_data, after_data, reason
  ) values (
    v_actor.id, p_device_id, 'round_closed', 'round', v_round.id,
    v_before,
    jsonb_build_object(
      'round', to_jsonb(v_round),
      'initial_load', v_capacity.initial_load,
      'reloads', v_capacity.reloads,
      'total_loaded', v_capacity.total_loaded,
      'net_sold', v_capacity.net_sold,
      'returned_full', v_round.returned_full_qty,
      'returned_empty', v_round.returned_empty_qty,
      'damaged', v_round.damaged_qty
    ),
    trim(coalesce(p_notes, ''))
  );

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object(
      'round', to_jsonb(v_round),
      'initial_load', v_capacity.initial_load,
      'reloads', v_capacity.reloads,
      'total_loaded', v_capacity.total_loaded,
      'net_sold_quantity', v_capacity.net_sold
    )
  );
end;
$$;

revoke all on function public.register_round_return(uuid,uuid,uuid,integer,integer,integer,text,text)
from public, anon, authenticated;
revoke all on function public.finalize_round_close(uuid,uuid,uuid,text)
from public, anon, authenticated;

grant execute on function public.register_round_return(uuid,uuid,uuid,integer,integer,integer,text,text)
to authenticated;
grant execute on function public.finalize_round_close(uuid,uuid,uuid,text)
to authenticated;
