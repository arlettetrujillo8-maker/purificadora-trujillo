-- Bug reportado en producción: "Recargar ruta" fallaba con
--   null value in column "reason" of relation "audit_log"
--   violates not-null constraint
-- cuando el campo "Notas" se dejaba vacío.
--
-- Causa: reload_round() usaba
--   nullif(trim(coalesce(p_notes, '')), '')
-- para el reason del audit_log. nullif(x, '') convierte un texto
-- vacío en NULL -- y audit_log.reason es NOT NULL. El resto de las
-- funciones del sistema (close_cash_session, register_round_return,
-- finalize_round_close) ya insertan trim(coalesce(p_notes, '')) SIN
-- nullif para audit_log.reason, dejando '' cuando no hay notas; solo
-- reload_round tenía esta inconsistencia.
--
-- Fix: se quita el nullif() para el reason del audit_log. El resto
-- de la función queda idéntico (mismos permisos, misma validación
-- de capacidad, mismos movimientos de inventario).

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
    trim(coalesce(p_notes, ''))
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

notify pgrst, 'reload schema';
