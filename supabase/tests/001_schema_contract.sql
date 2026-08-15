-- Run after migrations against a disposable development database.
begin;

do $$
declare
  required_tables text[] := array[
    'profiles','clients','sales','sale_corrections','payments','ledger_entries',
    'cash_sessions','cash_movements','expenses','inventory_locations',
    'inventory_movements','rounds','supplies','supply_movements',
    'maintenance_events','audit_log','devices','settings','operations',
    'legacy_imports','folio_counters'
  ];
  table_name text;
  missing_rls text;
begin
  foreach table_name in array required_tables loop
    if to_regclass('public.' || table_name) is null then
      raise exception 'Missing required table: %', table_name;
    end if;
  end loop;

  select c.relname into missing_rls
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname=any(required_tables)
    and c.relkind='r' and not c.relrowsecurity
  limit 1;

  if missing_rls is not null then
    raise exception 'RLS disabled on: %', missing_rls;
  end if;

  if has_table_privilege('anon','public.sales','select')
     or has_table_privilege('anon','public.clients','select') then
    raise exception 'anon unexpectedly has business table access';
  end if;

  if not has_function_privilege('authenticated','public.register_sale(uuid,uuid,uuid,jsonb)','execute') then
    raise exception 'authenticated cannot execute register_sale';
  end if;

  if has_function_privilege('anon','public.register_sale(uuid,uuid,uuid,jsonb)','execute') then
    raise exception 'anon can execute register_sale';
  end if;
end
$$;

rollback;
