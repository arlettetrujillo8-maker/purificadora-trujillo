-- V3 central: make Postgres Changes reproducible for every operational table.
-- This migration is idempotent so it is safe when Studio already enabled
-- Realtime for some of the tables.
do $$
declare
  table_name text;
  operational_tables constant text[] := array[
    'profiles',
    'clients',
    'cash_sessions',
    'rounds',
    'sales',
    'sale_corrections',
    'sale_returns',
    'sale_cash_adjustments',
    'payments',
    'ledger_entries',
    'cash_movements',
    'expenses',
    'inventory_locations',
    'inventory_movements',
    'supplies',
    'supply_movements',
    'maintenance_events',
    'settings',
    'audit_log'
  ];
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  foreach table_name in array operational_tables loop
    if to_regclass(format('public.%I', table_name)) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = table_name
       ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end;
$$;
