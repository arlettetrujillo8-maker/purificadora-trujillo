-- Purificadora Trujillo V3.0: central schema, explicit grants and initial RPCs.
-- This migration is intentionally not linked to or applied on a remote project yet.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  username text not null,
  role text not null check (role in ('administrador','ventanilla','repartidor','caja','inventario')),
  center text not null check (center in ('local','ruta1','ruta2')),
  route text check (route is null or route in ('ruta1','ruta2')),
  permissions text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_normalized_unique unique (username),
  constraint profiles_route_role_check check (
    (role = 'repartidor' and route is not null)
    or (role <> 'repartidor' and route is null)
  )
);

create table public.devices (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.clients (
  id uuid primary key,
  name text not null check (length(trim(name)) between 1 and 160),
  phone text not null default '',
  phone_normalized text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored,
  address text not null default '',
  normal_route text not null default 'ninguna' check (normal_route in ('ventanilla','ruta1','ruta2','ninguna')),
  client_type text not null default 'general' check (client_type in ('general','special')),
  special_price_cents bigint check (special_price_cents is null or special_price_cents >= 0),
  notes text not null default '',
  active boolean not null default true,
  possible_duplicate boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);

create table public.operations (
  id uuid primary key,
  device_id uuid not null references public.devices(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  operation_type text not null,
  payload_hash text not null,
  status text not null default 'processing' check (status in ('processing','completed','failed','conflict')),
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (device_id, operation_type, id)
);

create table public.folio_counters (
  entity_type text primary key check (entity_type in ('sale','payment','correction')),
  prefix text not null check (prefix ~ '^[A-Z]{1,3}$'),
  last_value bigint not null default 0 check (last_value >= 0)
);

insert into public.folio_counters(entity_type, prefix)
values ('sale','V'),('payment','P'),('correction','C')
on conflict (entity_type) do nothing;

create table public.cash_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  center text not null check (center in ('local','ruta1','ruta2')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cents bigint not null check (opening_cents >= 0),
  expected_cents bigint,
  counted_cents bigint,
  difference_cents bigint,
  difference_reason text,
  status text not null default 'open' check (status in ('open','closed')),
  opened_operation_id uuid not null unique references public.operations(id) on delete restrict,
  closed_operation_id uuid unique references public.operations(id) on delete restrict,
  constraint cash_session_close_shape check (
    (status = 'open' and closed_at is null and expected_cents is null and counted_cents is null and difference_cents is null)
    or
    (status = 'closed' and closed_at is not null and expected_cents is not null and counted_cents is not null and difference_cents = counted_cents - expected_cents)
  ),
  constraint cash_session_difference_reason check (difference_cents is null or difference_cents = 0 or length(trim(coalesce(difference_reason,''))) > 0)
);

create unique index cash_sessions_one_open_per_user_idx
  on public.cash_sessions(user_id) where status = 'open';

create table public.rounds (
  id uuid primary key,
  route text not null check (route in ('ruta1','ruta2')),
  user_id uuid not null references public.profiles(id) on delete restrict,
  round_number bigint not null check (round_number > 0),
  started_at timestamptz not null default now(),
  returned_at timestamptz,
  closed_at timestamptz,
  loaded_full_qty integer not null check (loaded_full_qty > 0),
  returned_full_qty integer check (returned_full_qty is null or returned_full_qty >= 0),
  returned_empty_qty integer check (returned_empty_qty is null or returned_empty_qty >= 0),
  damaged_qty integer check (damaged_qty is null or damaged_qty >= 0),
  lost_qty integer check (lost_qty is null or lost_qty >= 0),
  status text not null default 'preparing' check (status in ('preparing','active','returned','closed')),
  start_operation_id uuid not null unique references public.operations(id) on delete restrict,
  close_operation_id uuid unique references public.operations(id) on delete restrict,
  unique (route, round_number)
);

create unique index rounds_one_open_per_route_idx
  on public.rounds(route) where status <> 'closed';

create table public.sales (
  id uuid primary key,
  folio text unique,
  client_id uuid references public.clients(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  channel text not null check (channel in ('ventanilla','ruta1','ruta2','fuera_ruta','fuera_horario')),
  route text check (route is null or route in ('ruta1','ruta2')),
  round_id uuid references public.rounds(id) on delete restrict,
  cash_session_id uuid references public.cash_sessions(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  paid_cents bigint not null check (paid_cents >= 0),
  credit_cents bigint not null check (credit_cents >= 0),
  payment_method text not null check (payment_method in ('efectivo','transferencia','fiado','mixto')),
  status text not null default 'active' check (status in ('active','corrected','voided')),
  original_sale_id uuid references public.sales(id) on delete restrict,
  device_id uuid not null references public.devices(id) on delete restrict,
  operation_id uuid not null unique references public.operations(id) on delete restrict,
  notes text not null default '',
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  constraint sales_amounts_match check (total_cents = unit_price_cents * quantity and paid_cents + credit_cents = total_cents),
  constraint sales_credit_client check (credit_cents = 0 or client_id is not null),
  constraint sales_cash_session_check check (
    (payment_method in ('efectivo','mixto') and paid_cents > 0 and cash_session_id is not null)
    or payment_method not in ('efectivo','mixto')
    or paid_cents = 0
  )
);

create table public.sale_corrections (
  id uuid primary key,
  folio text not null unique,
  original_sale_id uuid not null unique references public.sales(id) on delete restrict,
  replacement_sale_id uuid references public.sales(id) on delete restrict,
  correction_type text not null check (correction_type in ('correct','void')),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  device_id uuid not null references public.devices(id) on delete restrict,
  operation_id uuid not null unique references public.operations(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint sale_corrections_replacement check ((correction_type = 'correct' and replacement_sale_id is not null) or (correction_type = 'void' and replacement_sale_id is null))
);

create table public.payments (
  id uuid primary key,
  folio text not null unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  cash_session_id uuid references public.cash_sessions(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  payment_method text not null check (payment_method in ('efectivo','transferencia')),
  device_id uuid not null references public.devices(id) on delete restrict,
  operation_id uuid not null unique references public.operations(id) on delete restrict,
  notes text not null default '',
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint payments_cash_session_check check (payment_method <> 'efectivo' or cash_session_id is not null)
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  entry_type text not null check (entry_type in ('charge','payment','reversal','adjustment')),
  amount_cents bigint not null check (amount_cents <> 0),
  sale_id uuid references public.sales(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  reason text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null references public.operations(id) on delete restrict,
  constraint ledger_reference_present check (sale_id is not null or payment_id is not null or entry_type = 'adjustment')
);

create unique index ledger_sale_effect_idx on public.ledger_entries(sale_id, entry_type) where sale_id is not null;
create unique index ledger_payment_effect_idx on public.ledger_entries(payment_id, entry_type) where payment_id is not null;

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  movement_type text not null check (movement_type in ('cash_sale','debt_payment','cash_expense','refund','withdrawal','deposit','route_handover','adjustment')),
  direction text not null check (direction in ('in','out')),
  amount_cents bigint not null check (amount_cents > 0),
  reference_type text not null,
  reference_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  operation_id uuid not null references public.operations(id) on delete restrict,
  unique (operation_id, movement_type)
);

create table public.expenses (
  id uuid primary key,
  concept text not null check (length(trim(concept)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  center text not null check (center in ('local','ruta1','ruta2')),
  payment_method text not null check (payment_method in ('efectivo','transferencia','otro')),
  affects_cash boolean not null default true,
  cash_session_id uuid references public.cash_sessions(id) on delete restrict,
  notes text not null default '',
  user_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null unique references public.operations(id) on delete restrict,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint expense_cash_check check (not affects_cash or payment_method <> 'efectivo' or cash_session_id is not null)
);

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  location_code text not null check (location_code in ('local','wash','route_1','route_2','damaged')),
  container_type text not null check (container_type in ('full','empty','damaged')),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (location_code, container_type)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  container_type text not null check (container_type in ('full','empty','damaged')),
  from_location_id uuid references public.inventory_locations(id) on delete restrict,
  to_location_id uuid references public.inventory_locations(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  movement_type text not null,
  reference_type text not null,
  reference_id uuid not null,
  round_id uuid references public.rounds(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  operation_id uuid not null references public.operations(id) on delete restrict,
  constraint inventory_has_endpoint check (from_location_id is not null or to_location_id is not null),
  constraint inventory_distinct_endpoints check (from_location_id is null or to_location_id is null or from_location_id <> to_location_id)
);

create unique index inventory_operation_effect_idx
  on public.inventory_movements(operation_id, movement_type, coalesce(from_location_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(to_location_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.supplies (
  id uuid primary key,
  name text not null unique check (length(trim(name)) > 0),
  category text not null default 'general',
  unit text not null,
  minimum_stock numeric(14,3) not null default 0 check (minimum_stock >= 0),
  current_stock numeric(14,3) not null default 0 check (current_stock >= 0),
  cost_cents bigint not null default 0 check (cost_cents >= 0),
  consumption_per_unit numeric(14,6) not null default 0 check (consumption_per_unit >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.supply_movements (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references public.supplies(id) on delete restrict,
  movement_type text not null check (movement_type in ('purchase','consumption','adjustment','loss')),
  quantity numeric(14,3) not null check (quantity <> 0),
  unit_cost_cents bigint not null default 0 check (unit_cost_cents >= 0),
  reference_id uuid,
  user_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null references public.operations(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.maintenance_events (
  id uuid primary key,
  event_type text not null check (event_type in ('production','service','threshold_change')),
  quantity integer not null default 0 check (quantity >= 0),
  previous_count integer check (previous_count is null or previous_count >= 0),
  notes text not null default '',
  user_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null unique references public.operations(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  device_id uuid references public.devices(id) on delete restrict,
  action text not null,
  entity text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table public.legacy_imports (
  id uuid primary key default gen_random_uuid(),
  migration_id uuid not null,
  source_key text not null,
  entity_type text not null,
  legacy_id text not null,
  target_id uuid not null,
  source_hash text not null,
  imported_at timestamptz not null default now(),
  unique (source_key, entity_type, legacy_id),
  unique (migration_id, entity_type, target_id)
);

create index clients_phone_idx on public.clients(phone_normalized) where phone_normalized <> '';
create index clients_name_idx on public.clients(lower(name));
create index clients_route_idx on public.clients(normal_route, active);
create index clients_updated_idx on public.clients(updated_at desc);
create index sales_occurred_idx on public.sales(occurred_at desc);
create index sales_client_idx on public.sales(client_id, occurred_at desc);
create index sales_user_idx on public.sales(user_id, occurred_at desc);
create index sales_round_idx on public.sales(round_id) where round_id is not null;
create index ledger_client_idx on public.ledger_entries(client_id, created_at, id);
create index cash_movements_session_idx on public.cash_movements(cash_session_id, created_at);
create index inventory_from_idx on public.inventory_movements(from_location_id, created_at) where from_location_id is not null;
create index inventory_to_idx on public.inventory_movements(to_location_id, created_at) where to_location_id is not null;
create index rounds_user_idx on public.rounds(user_id, started_at desc);
create index audit_created_idx on public.audit_log(created_at desc);
create index audit_entity_idx on public.audit_log(entity, entity_id, created_at desc);

create or replace function app_private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id from public.profiles p
  where p.auth_user_id = (select auth.uid()) and p.active
  limit 1
$$;

create or replace function app_private.current_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.role from public.profiles p
  where p.auth_user_id = (select auth.uid()) and p.active
  limit 1
$$;

create or replace function app_private.current_route()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.route from public.profiles p
  where p.auth_user_id = (select auth.uid()) and p.active
  limit 1
$$;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$ select coalesce(app_private.current_role() = 'administrador', false) $$;

revoke all on all functions in schema app_private from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.clients enable row level security;
alter table public.operations enable row level security;
alter table public.folio_counters enable row level security;
alter table public.sales enable row level security;
alter table public.sale_corrections enable row level security;
alter table public.payments enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.expenses enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.rounds enable row level security;
alter table public.supplies enable row level security;
alter table public.supply_movements enable row level security;
alter table public.maintenance_events enable row level security;
alter table public.settings enable row level security;
alter table public.audit_log enable row level security;
alter table public.legacy_imports enable row level security;

create policy profiles_read on public.profiles for select to authenticated
using (app_private.is_admin() or id = app_private.current_profile_id());

create policy devices_read on public.devices for select to authenticated
using (app_private.is_admin() or user_id = app_private.current_profile_id());

create policy clients_read on public.clients for select to authenticated
using (
  app_private.is_admin()
  or app_private.current_role() in ('ventanilla','caja','inventario')
  or created_by = app_private.current_profile_id()
  or normal_route = app_private.current_route()
);

create policy operations_read on public.operations for select to authenticated
using (app_private.is_admin() or user_id = app_private.current_profile_id());

create policy sales_read on public.sales for select to authenticated
using (
  app_private.is_admin()
  or user_id = app_private.current_profile_id()
  or (app_private.current_role() in ('ventanilla','caja') and channel in ('ventanilla','fuera_horario'))
  or route = app_private.current_route()
);

create policy corrections_read on public.sale_corrections for select to authenticated
using (app_private.is_admin() or created_by = app_private.current_profile_id());

create policy payments_read on public.payments for select to authenticated
using (app_private.is_admin() or user_id = app_private.current_profile_id());

create policy ledger_read on public.ledger_entries for select to authenticated
using (
  app_private.is_admin()
  or created_by = app_private.current_profile_id()
  or exists (select 1 from public.clients c where c.id = client_id and c.normal_route = app_private.current_route())
);

create policy cash_sessions_read on public.cash_sessions for select to authenticated
using (app_private.is_admin() or user_id = app_private.current_profile_id());

create policy cash_movements_read on public.cash_movements for select to authenticated
using (app_private.is_admin() or user_id = app_private.current_profile_id());

create policy expenses_read on public.expenses for select to authenticated
using (app_private.is_admin() or user_id = app_private.current_profile_id());

create policy inventory_locations_read on public.inventory_locations for select to authenticated
using (app_private.current_profile_id() is not null);

create policy inventory_movements_read on public.inventory_movements for select to authenticated
using (app_private.is_admin() or user_id = app_private.current_profile_id() or app_private.current_role() = 'inventario');

create policy rounds_read on public.rounds for select to authenticated
using (app_private.is_admin() or user_id = app_private.current_profile_id() or route = app_private.current_route());

create policy supplies_read on public.supplies for select to authenticated
using (app_private.current_profile_id() is not null);

create policy supply_movements_read on public.supply_movements for select to authenticated
using (app_private.is_admin() or user_id = app_private.current_profile_id() or app_private.current_role() = 'inventario');

create policy maintenance_read on public.maintenance_events for select to authenticated
using (app_private.current_profile_id() is not null);

create policy settings_read on public.settings for select to authenticated
using (app_private.current_profile_id() is not null);

create policy audit_read on public.audit_log for select to authenticated
using (app_private.is_admin() or user_id = app_private.current_profile_id());

create policy legacy_imports_read on public.legacy_imports for select to authenticated
using (app_private.is_admin());

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.devices, public.clients, public.operations,
  public.sales, public.sale_corrections, public.payments, public.ledger_entries,
  public.cash_sessions, public.cash_movements, public.expenses,
  public.inventory_locations, public.inventory_movements, public.rounds,
  public.supplies, public.supply_movements, public.maintenance_events,
  public.settings, public.audit_log, public.legacy_imports to authenticated;

create or replace function app_private.next_folio(p_entity_type text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_prefix text; v_value bigint;
begin
  update public.folio_counters
  set last_value = last_value + 1
  where entity_type = p_entity_type
  returning prefix, last_value into v_prefix, v_value;
  if not found then raise exception 'unknown_folio_type' using errcode = '22023'; end if;
  return v_prefix || '-' || lpad(v_value::text, 6, '0');
end;
$$;

create or replace function app_private.claim_operation(
  p_operation_id uuid,
  p_device_id uuid,
  p_operation_type text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_user_id uuid := app_private.current_profile_id(); v_existing public.operations%rowtype; v_hash text := md5(p_payload::text);
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.devices d where d.id = p_device_id and d.user_id = v_user_id and d.active) then
    raise exception 'device_not_authorized' using errcode = '42501';
  end if;
  insert into public.operations(id, device_id, user_id, operation_type, payload_hash)
  values (p_operation_id, p_device_id, v_user_id, p_operation_type, v_hash)
  on conflict (id) do nothing;
  if found then return null; end if;
  select * into v_existing from public.operations where id = p_operation_id for update;
  if v_existing.device_id <> p_device_id or v_existing.user_id <> v_user_id or v_existing.operation_type <> p_operation_type or v_existing.payload_hash <> v_hash then
    raise exception 'idempotency_conflict' using errcode = '23505';
  end if;
  if v_existing.status = 'completed' then return v_existing.result; end if;
  raise exception 'operation_in_progress' using errcode = '55000';
end;
$$;

create or replace function app_private.complete_operation(p_operation_id uuid, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.operations set status = 'completed', result = p_result, completed_at = now() where id = p_operation_id;
  return p_result;
end;
$$;

create or replace function public.register_device(p_device_id uuid, p_name text)
returns public.devices
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_user_id uuid := app_private.current_profile_id(); v_device public.devices;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  insert into public.devices(id,user_id,name,last_seen_at)
  values (p_device_id,v_user_id,trim(p_name),now())
  on conflict (id) do update set name=excluded.name,last_seen_at=excluded.last_seen_at
    where public.devices.user_id=v_user_id
  returning * into v_device;
  if v_device.id is null then raise exception 'device_owned_by_another_user' using errcode='42501'; end if;
  return v_device;
end;
$$;

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
declare v_actor uuid := app_private.current_profile_id(); v_cached jsonb; v_client public.clients;
begin
  v_cached := app_private.claim_operation(p_operation_id,p_device_id,'create_client',p_payload);
  if v_cached is not null then return v_cached; end if;
  insert into public.clients(id,name,phone,address,normal_route,client_type,special_price_cents,notes,created_by)
  values (p_client_id,trim(p_payload->>'name'),coalesce(p_payload->>'phone',''),coalesce(p_payload->>'address',''),
    coalesce(p_payload->>'normal_route','ninguna'),coalesce(p_payload->>'client_type','general'),
    nullif(p_payload->>'special_price_cents','')::bigint,coalesce(p_payload->>'notes',''),v_actor)
  returning * into v_client;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data)
  values(v_actor,p_device_id,'client_created','client',v_client.id,to_jsonb(v_client));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('client',to_jsonb(v_client)));
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
declare v_actor public.profiles; v_payload jsonb; v_cached jsonb; v_session public.cash_sessions;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  v_payload:=jsonb_build_object('session_id',p_session_id,'opening_cents',p_opening_cents);
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'open_cash_session',v_payload);
  if v_cached is not null then return v_cached; end if;
  if p_opening_cents < 0 then raise exception 'invalid_opening_amount' using errcode='22023'; end if;
  insert into public.cash_sessions(id,user_id,center,opening_cents,opened_operation_id)
  values(p_session_id,v_actor.id,v_actor.center,p_opening_cents,p_operation_id) returning * into v_session;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data)
  values(v_actor.id,p_device_id,'cash_opened','cash_session',v_session.id,to_jsonb(v_session));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('cash_session',to_jsonb(v_session)));
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
  v_actor public.profiles; v_cached jsonb; v_sale public.sales; v_location public.inventory_locations;
  v_qty integer := (p_payload->>'quantity')::integer;
  v_unit bigint := (p_payload->>'unit_price_cents')::bigint;
  v_total bigint := (p_payload->>'total_cents')::bigint;
  v_paid bigint := (p_payload->>'paid_cents')::bigint;
  v_credit bigint := (p_payload->>'credit_cents')::bigint;
  v_method text := p_payload->>'payment_method';
  v_cash_session uuid := nullif(p_payload->>'cash_session_id','')::uuid;
  v_client uuid := nullif(p_payload->>'client_id','')::uuid;
  v_location_id uuid := (p_payload->>'inventory_location_id')::uuid;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'register_sale',p_payload);
  if v_cached is not null then return v_cached; end if;
  if v_qty <= 0 or v_unit < 0 or v_total <> v_qty*v_unit or v_paid < 0 or v_credit < 0 or v_paid+v_credit<>v_total then
    raise exception 'invalid_sale_amounts' using errcode='23514';
  end if;
  if v_credit>0 and v_client is null then raise exception 'credit_requires_client' using errcode='23514'; end if;
  if v_method in ('efectivo','mixto') and v_paid>0 and not exists(
    select 1 from public.cash_sessions c where c.id=v_cash_session and c.user_id=v_actor.id and c.status='open'
  ) then raise exception 'open_cash_session_required' using errcode='23514'; end if;
  select * into v_location from public.inventory_locations where id=v_location_id for update;
  if v_location.id is null or v_location.container_type<>'full' or v_location.quantity<v_qty then
    raise exception 'insufficient_inventory' using errcode='23514';
  end if;
  update public.inventory_locations set quantity=quantity-v_qty,updated_at=now() where id=v_location.id;
  insert into public.sales(id,folio,client_id,user_id,channel,route,round_id,cash_session_id,quantity,unit_price_cents,total_cents,paid_cents,credit_cents,payment_method,device_id,operation_id,notes,occurred_at)
  values(p_sale_id,app_private.next_folio('sale'),v_client,v_actor.id,p_payload->>'channel',nullif(p_payload->>'route',''),nullif(p_payload->>'round_id','')::uuid,v_cash_session,v_qty,v_unit,v_total,v_paid,v_credit,v_method,p_device_id,p_operation_id,coalesce(p_payload->>'notes',''),coalesce((p_payload->>'occurred_at')::timestamptz,now()))
  returning * into v_sale;
  insert into public.inventory_movements(container_type,from_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id)
  values('full',v_location.id,v_qty,'sale','sale',v_sale.id,v_sale.round_id,v_actor.id,p_operation_id);
  if v_credit>0 then
    insert into public.ledger_entries(client_id,entry_type,amount_cents,sale_id,reason,created_by,operation_id)
    values(v_client,'charge',v_credit,v_sale.id,'Venta fiada',v_actor.id,p_operation_id);
  end if;
  if v_method in ('efectivo','mixto') and v_paid>0 then
    insert into public.cash_movements(cash_session_id,movement_type,direction,amount_cents,reference_type,reference_id,user_id,operation_id)
    values(v_cash_session,'cash_sale','in',v_paid,'sale',v_sale.id,v_actor.id,p_operation_id);
  end if;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data)
  values(v_actor.id,p_device_id,'sale_registered','sale',v_sale.id,to_jsonb(v_sale));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('sale',to_jsonb(v_sale)));
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
declare v_actor uuid:=app_private.current_profile_id(); v_cached jsonb; v_payment public.payments; v_client uuid:=(p_payload->>'client_id')::uuid; v_amount bigint:=(p_payload->>'amount_cents')::bigint; v_method text:=p_payload->>'payment_method'; v_cash uuid:=nullif(p_payload->>'cash_session_id','')::uuid; v_balance bigint;
begin
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'register_payment',p_payload);
  if v_cached is not null then return v_cached; end if;
  select coalesce(sum(amount_cents),0) into v_balance from public.ledger_entries where client_id=v_client;
  if v_amount<=0 or v_amount>v_balance then raise exception 'invalid_payment_amount' using errcode='23514'; end if;
  if v_method='efectivo' and not exists(select 1 from public.cash_sessions where id=v_cash and user_id=v_actor and status='open') then
    raise exception 'open_cash_session_required' using errcode='23514';
  end if;
  insert into public.payments(id,folio,client_id,user_id,cash_session_id,amount_cents,payment_method,device_id,operation_id,notes,occurred_at)
  values(p_payment_id,app_private.next_folio('payment'),v_client,v_actor,v_cash,v_amount,v_method,p_device_id,p_operation_id,coalesce(p_payload->>'notes',''),coalesce((p_payload->>'occurred_at')::timestamptz,now())) returning * into v_payment;
  insert into public.ledger_entries(client_id,entry_type,amount_cents,payment_id,reason,created_by,operation_id)
  values(v_client,'payment',-v_amount,v_payment.id,'Abono de fiado',v_actor,p_operation_id);
  if v_method='efectivo' then
    insert into public.cash_movements(cash_session_id,movement_type,direction,amount_cents,reference_type,reference_id,user_id,operation_id)
    values(v_cash,'debt_payment','in',v_amount,'payment',v_payment.id,v_actor,p_operation_id);
  end if;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data)
  values(v_actor,p_device_id,'payment_registered','payment',v_payment.id,to_jsonb(v_payment));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('payment',to_jsonb(v_payment)));
end;
$$;

revoke all on function public.register_device(uuid,text) from public, anon;
revoke all on function public.create_client(uuid,uuid,uuid,jsonb) from public, anon;
revoke all on function public.open_cash_session(uuid,uuid,uuid,bigint) from public, anon;
revoke all on function public.register_sale(uuid,uuid,uuid,jsonb) from public, anon;
revoke all on function public.register_payment(uuid,uuid,uuid,jsonb) from public, anon;
grant execute on function public.register_device(uuid,text) to authenticated;
grant execute on function public.create_client(uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.open_cash_session(uuid,uuid,uuid,bigint) to authenticated;
grant execute on function public.register_sale(uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.register_payment(uuid,uuid,uuid,jsonb) to authenticated;

alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke usage, select on sequences from anon, authenticated;
