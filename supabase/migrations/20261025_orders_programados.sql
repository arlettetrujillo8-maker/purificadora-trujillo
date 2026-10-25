-- F5: pedidos programados (oficina -> reparto).
-- Aplicar en el SQL Editor. Sin esta migracion la app trabaja con pedidos
-- locales en el dispositivo (fallback), sin errores.

create table if not exists public.orders (
  id uuid primary key,
  client_id uuid not null references public.clients(id) on delete restrict,
  route text not null check (route ~ '^ruta[0-9]+$' or route = 'ventanilla'),
  scheduled_date date not null default current_date,
  qty integer not null default 1 check (qty > 0),
  price_cents bigint not null default 0 check (price_cents >= 0),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'entregado', 'cancelado')),
  notes text not null default '',
  created_by uuid references public.profiles(id),
  delivered_at timestamptz,
  sale_id uuid references public.sales(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_pending_idx
  on public.orders(status, scheduled_date, route);

alter table public.orders enable row level security;

drop policy if exists orders_read_authenticated on public.orders;
create policy orders_read_authenticated on public.orders
  for select to authenticated using (true);

grant select on public.orders to authenticated;

-- Alta de pedido (oficina). Valida perfil activo con permiso de venta/rondas.
create or replace function public.create_order(
  p_order_id uuid,
  p_client_id uuid,
  p_route text,
  p_scheduled_date date,
  p_qty integer,
  p_price_cents bigint,
  p_notes text default ''
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor public.profiles%rowtype;
  v_order public.orders;
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id() and active;

  if v_actor.id is null then
    raise exception 'operation_not_authorized';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'invalid_order_qty';
  end if;
  if p_price_cents is null or p_price_cents < 0 then
    raise exception 'invalid_order_price';
  end if;

  insert into public.orders(
    id, client_id, route, scheduled_date, qty, price_cents, notes, created_by
  ) values (
    p_order_id, p_client_id, p_route, p_scheduled_date, p_qty,
    p_price_cents, coalesce(p_notes, ''), v_actor.id
  )
  returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.create_order(uuid, uuid, text, date, integer, bigint, text) to authenticated;

-- Cambio de estado: entregado (con venta) o cancelado.
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status text,
  p_sale_id uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor public.profiles%rowtype;
  v_order public.orders;
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id() and active;

  if v_actor.id is null then
    raise exception 'operation_not_authorized';
  end if;
  if p_status not in ('entregado', 'cancelado') then
    raise exception 'invalid_order_status';
  end if;

  update public.orders
  set status = p_status,
      delivered_at = case when p_status = 'entregado' then now() else delivered_at end,
      sale_id = coalesce(p_sale_id, sale_id),
      updated_at = now()
  where id = p_order_id
    and status = 'pendiente'
  returning * into v_order;

  if v_order.id is null then
    raise exception 'order_not_found_or_closed';
  end if;
  return v_order;
end;
$$;

grant execute on function public.set_order_status(uuid, text, uuid) to authenticated;
