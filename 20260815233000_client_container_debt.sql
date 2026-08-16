-- Deuda de envases por cliente ("¿quién me debe garrafones?").
-- Empieza a contar desde hoy (no retroactivo): la columna nace en 0 para
-- todos los clientes existentes, y solo las ventas registradas DESPUÉS de
-- aplicar esta migración afectan el saldo.
--
-- Reutiliza el mismo mecanismo que ya calcula el efecto de envases de cada
-- venta (app_private.apply_sale_container_effect / reverse_sale_container_effect,
-- de la migración 20260815010351_simplified_container_flow.sql) en vez de
-- crear una ruta paralela: así una venta, su devolución o su corrección
-- ajustan el inventario Y la deuda de envases en la misma transacción,
-- sin poder desincronizarse entre sí.

alter table public.clients
  add column if not exists container_debt integer not null default 0;

-- ---------------------------------------------------------------------
-- 1) Alta de deuda: al registrarse una venta con cliente, si no regresó
--    todos los vacíos correspondientes (ni se dañaron), la diferencia se
--    suma a container_debt.
-- ---------------------------------------------------------------------
create or replace function app_private.apply_sale_container_effect()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empty public.inventory_locations;
  v_damaged public.inventory_locations;
  v_debt integer;
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

  if new.client_id is not null then
    v_debt := new.quantity - new.empty_return_quantity - new.damaged_return_quantity;
    if v_debt <> 0 then
      update public.clients set container_debt = container_debt + v_debt where id = new.client_id;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Reversa de deuda: al devolver o corregir (parcial o total) una
--    venta, se le resta proporcionalmente al cliente lo que ya se le
--    había cargado -- mismo patrón matemático que ya usa la función para
--    revertir envases vacíos/dañados (acumulado nuevo menos acumulado
--    previo, para que devoluciones parciales sucesivas de la misma venta
--    no se descuadren).
-- ---------------------------------------------------------------------
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
  v_debt_total integer;
  v_debt_qty integer;
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

  if p_sale.client_id is not null then
    v_debt_total := p_sale.quantity - coalesce(p_sale.empty_return_quantity,p_sale.quantity) - coalesce(p_sale.damaged_return_quantity,0);
    if v_debt_total <> 0 then
      v_debt_qty := round(v_debt_total::numeric*(v_prior+p_quantity)::numeric/p_sale.quantity::numeric)::integer
        - round(v_debt_total::numeric*v_prior::numeric/p_sale.quantity::numeric)::integer;
      if v_debt_qty <> 0 then
        update public.clients set container_debt = container_debt - v_debt_qty where id = p_sale.client_id;
      end if;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Entrega de envases sueltos: el cliente viene solo a dejar vacíos,
--    sin comprar. Reduce container_debt y suma al inventario de vacíos
--    del lugar indicado (Local por defecto). Nunca deja container_debt
--    negativo -- si trae más de lo que debe, el excedente no resta.
-- ---------------------------------------------------------------------
create or replace function public.return_client_containers(
  p_operation_id uuid,
  p_device_id uuid,
  p_client_id uuid,
  p_quantity integer,
  p_location text default 'local',
  p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_client public.clients;
  v_empty public.inventory_locations;
  v_cached jsonb;
  v_applied integer;
  v_location_key text;
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id();

  if v_actor.id is null or not app_private.can_operate('view_client_debt') then
    raise exception 'operation_not_authorized' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_container_return_quantity' using errcode = '22023';
  end if;

  v_cached := app_private.claim_operation(
    p_operation_id, p_device_id, 'return_client_containers',
    jsonb_build_object('client_id', p_client_id, 'quantity', p_quantity, 'location', p_location)
  );
  if v_cached is not null then return v_cached; end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if v_client.id is null then
    raise exception 'client_not_found' using errcode = '22023';
  end if;

  v_location_key := case
    when p_location in ('ruta1','ruta2') then 'empty_'||p_location
    else 'empty_local'
  end;
  select * into v_empty from public.inventory_locations
  where id = app_private.inventory_location_id(v_location_key) for update;
  if v_empty.id is null then
    raise exception 'empty_inventory_location_missing' using errcode = 'P0002';
  end if;

  v_applied := least(p_quantity, greatest(v_client.container_debt, 0));

  update public.clients
  set container_debt = container_debt - v_applied
  where id = v_client.id;

  update public.inventory_locations
  set quantity = quantity + p_quantity, updated_at = now()
  where id = v_empty.id;

  insert into public.inventory_movements(
    container_type, to_location_id, quantity, movement_type,
    reference_type, reference_id, user_id, operation_id
  ) values (
    'empty', v_empty.id, p_quantity, 'client_container_return',
    'client', p_client_id, v_actor.id, p_operation_id
  );

  insert into public.audit_log(
    user_id, device_id, action, entity, entity_id, before_data, after_data, reason
  ) values (
    v_actor.id, p_device_id, 'client_containers_returned', 'client', p_client_id,
    jsonb_build_object('container_debt', v_client.container_debt),
    jsonb_build_object('container_debt', v_client.container_debt - v_applied, 'received', p_quantity),
    coalesce(nullif(trim(p_notes), ''), 'Entrega de envases')
  );

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object(
      'client_id', v_client.id,
      'container_debt', v_client.container_debt - v_applied,
      'received', p_quantity
    )
  );
end;
$$;

revoke all on function public.return_client_containers(uuid,uuid,uuid,integer,text,text)
from public, anon, authenticated;
grant execute on function public.return_client_containers(uuid,uuid,uuid,integer,text,text)
to authenticated;

notify pgrst, 'reload schema';
