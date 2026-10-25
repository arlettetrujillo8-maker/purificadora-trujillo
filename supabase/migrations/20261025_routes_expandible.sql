-- F3: rutas expandibles. Fuente unica de rutas + validaciones por patron para
-- permitir rutas nuevas (ruta3, ruta4, ...) sin migrar restricciones otra vez.
--
-- Aplicar en el SQL Editor del proyecto o con `supabase db push`.
-- Despues de aplicarla, el cliente toma las rutas de esta tabla; si no se
-- aplica, el cliente usa ruta1/ruta2 por defecto (fallback sin errores).

create table if not exists public.routes (
  code text primary key,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.routes enable row level security;

drop policy if exists routes_read_authenticated on public.routes;
create policy routes_read_authenticated on public.routes
  for select to authenticated using (true);

drop policy if exists routes_write_admin on public.routes;
create policy routes_write_admin on public.routes
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role = 'administrador'
        and p.active
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role = 'administrador'
        and p.active
    )
  );

grant select on public.routes to authenticated;
grant insert, update, delete on public.routes to authenticated;

insert into public.routes(code, name, sort_order)
values ('ruta1', 'Ruta 1', 10), ('ruta2', 'Ruta 2', 20)
on conflict (code) do nothing;

-- Quita las restricciones que fijaban ruta1/ruta2 y las sustituye por patrones.
do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in (
        'public.profiles'::regclass,
        'public.clients'::regclass,
        'public.sales'::regclass,
        'public.rounds'::regclass,
        'public.cash_sessions'::regclass,
        'public.inventory_locations'::regclass
      )
      and pg_get_constraintdef(oid) ~ 'ruta1|route_1'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_center_pattern check (center = 'local' or center ~ '^ruta[0-9]+$'),
  add constraint profiles_route_pattern check (route is null or route ~ '^ruta[0-9]+$');

alter table public.clients
  add constraint clients_normal_route_pattern check (
    normal_route in ('ventanilla', 'ninguna') or normal_route ~ '^ruta[0-9]+$'
  );

alter table public.sales
  add constraint sales_channel_pattern check (
    channel in ('ventanilla', 'fuera_ruta', 'fuera_horario') or channel ~ '^ruta[0-9]+$'
  ),
  add constraint sales_route_pattern check (route is null or route ~ '^ruta[0-9]+$');

alter table public.rounds
  add constraint rounds_route_pattern check (route ~ '^ruta[0-9]+$');

alter table public.cash_sessions
  add constraint cash_sessions_center_pattern check (center = 'local' or center ~ '^ruta[0-9]+$');

alter table public.inventory_locations
  add constraint inventory_location_code_pattern check (
    location_code in ('local', 'wash', 'damaged') or location_code ~ '^route_[0-9]+$'
  );

-- Inventario de una ruta nueva: crear sus dos filas (llenos/vacios).
-- Ejemplo para Ruta 3:
--   insert into public.routes(code, name, sort_order) values ('ruta3','Ruta 3',30);
--   insert into public.inventory_locations(location_code, container_type, quantity)
--   values ('route_3','full',0), ('route_3','empty',0);
