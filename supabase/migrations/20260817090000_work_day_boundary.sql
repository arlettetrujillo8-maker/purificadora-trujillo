-- V3: frontera de jornada.
--
-- Problema: "jornada" no existia en el servidor. El boton Cerrar jornada solo
-- cerraba cajas y rondas; el audit() del cliente es local y se descarta en la
-- siguiente recarga. Sin marca durable, las vistas no pueden distinguir la
-- jornada en curso del historico, asi que "Ultimas ventas" y los contadores
-- del dashboard arrastran ventas de jornadas anteriores.
--
-- Enfoque: registrar solo la FRONTERA, no reasignar ventas.
--   * No se agrega work_day_id a public.sales.
--   * No se toca register_sale ni se hace backfill.
--   * No se borra ni se mueve ningun dato existente.
-- La jornada en curso es "todo lo ocurrido despues del ultimo cierre", que se
-- deriva de max(closed_at). Las ventas viejas siguen intactas y consultables;
-- solo dejan de mostrarse en las vistas de la jornada activa.
--
-- Cerrar cajas y rondas sigue siendo responsabilidad de close_cash_session y
-- close_round, que ya validan efectivo e inventario. Esta RPC no los duplica:
-- forzar el cierre de una ronda sin su conciliacion de envases dejaria el
-- inventario inconsistente.

create table if not exists public.work_days (
  id uuid primary key default gen_random_uuid(),
  closed_at timestamptz not null default now(),
  closed_by uuid not null references public.profiles(id) on delete restrict,
  device_id uuid not null references public.devices(id) on delete restrict,
  operation_id uuid not null unique references public.operations(id) on delete restrict,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists work_days_closed_idx on public.work_days(closed_at desc);

alter table public.work_days enable row level security;

-- Todo el personal necesita leer la frontera: es lo que define que ve cada uno
-- en su turno, no solo el administrador.
drop policy if exists work_days_read on public.work_days;
create policy work_days_read on public.work_days for select to authenticated
using (true);

grant select on public.work_days to authenticated;

-- Cierra la jornada: deja la marca durable y la registra en auditoria.
-- Idempotente por p_operation_id, igual que el resto de comandos centrales.
create or replace function public.close_work_day(
  p_operation_id uuid,
  p_device_id uuid,
  p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_work_day public.work_days;
  v_open_cash integer;
  v_open_rounds integer;
  v_cached jsonb;
  v_payload jsonb;
begin
  select * into v_actor from public.profiles where id = app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('close_work_day') then
    raise exception 'operation_not_authorized' using errcode = '42501';
  end if;

  v_payload := jsonb_build_object('notes', coalesce(p_notes, ''));
  v_cached := app_private.claim_operation(p_operation_id, p_device_id, 'close_work_day', v_payload);
  if v_cached is not null then return v_cached; end if;

  -- Se rechaza en vez de forzar: una caja o una ronda cerrada sin su arqueo o
  -- su conciliacion de envases falsea el corte y descuadra el inventario.
  select count(*) into v_open_cash from public.cash_sessions where status = 'open';
  select count(*) into v_open_rounds from public.rounds where status <> 'closed';
  if v_open_cash > 0 or v_open_rounds > 0 then
    raise exception 'work_day_has_open_entities' using errcode = '55000';
  end if;

  insert into public.work_days(closed_by, device_id, operation_id, notes)
  values (v_actor.id, p_device_id, p_operation_id, coalesce(p_notes, ''))
  returning * into v_work_day;

  insert into public.audit_log(user_id, device_id, action, entity, entity_id, after_data, reason)
  values (v_actor.id, p_device_id, 'work_day_closed', 'work_day', v_work_day.id,
          to_jsonb(v_work_day), coalesce(p_notes, ''));

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object('work_day', to_jsonb(v_work_day))
  );
end;
$$;

grant execute on function public.close_work_day(uuid, uuid, text) to authenticated;

-- Realtime, para que cerrar la jornada en un dispositivo reinicie las vistas
-- de los demas sin recargar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'work_days'
  ) then
    alter publication supabase_realtime add table public.work_days;
  end if;
end;
$$;

-- Sin esto, PostgREST sigue con el esquema en cache y la app falla al
-- consultar la tabla con "Could not find the table public.work_days in the
-- schema cache". Mismo remedio que 20260814155522.
notify pgrst, 'reload schema';
