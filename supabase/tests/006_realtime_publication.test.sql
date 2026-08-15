begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(3);

select extensions.ok(
  exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ),
  'supabase_realtime publication exists'
);

select extensions.is_empty(
  $$
    select expected.table_name
    from unnest(array[
      'profiles', 'clients', 'cash_sessions', 'rounds', 'sales',
      'sale_corrections', 'sale_returns', 'sale_cash_adjustments',
      'payments', 'ledger_entries', 'cash_movements', 'expenses',
      'inventory_locations', 'inventory_movements', 'supplies',
      'supply_movements', 'maintenance_events', 'settings', 'audit_log'
    ]::text[]) as expected(table_name)
    where not exists (
      select 1
      from pg_publication_tables published
      where published.pubname = 'supabase_realtime'
        and published.schemaname = 'public'
        and published.tablename = expected.table_name
    )
  $$,
  'all operational tables are in supabase_realtime'
);

select extensions.results_eq(
  $$
    select count(*)::bigint
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('sales', 'clients', 'rounds', 'inventory_movements')
  $$,
  array[4::bigint],
  'critical synchronization tables are published exactly once'
);

select * from extensions.finish();
rollback;
