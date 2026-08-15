begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(14);

insert into auth.users(id,email) values
  ('14000000-0000-0000-0000-000000000001','qa-round-integrity@example.invalid');

insert into public.profiles(
  id,auth_user_id,name,username,role,center,permissions,active
) values (
  '24000000-0000-0000-0000-000000000001',
  '14000000-0000-0000-0000-000000000001',
  'QA Round Integrity','qa_round_integrity','administrador','local','{}',true
);

insert into public.devices(id,user_id,name,last_seen_at) values (
  '34000000-0000-0000-0000-000000000001',
  '24000000-0000-0000-0000-000000000001',
  'QA round integrity device',now()
);

insert into public.settings(key,value,updated_by,updated_at)
values (
  'pricing',jsonb_build_object('default_price_cents',1400),
  '24000000-0000-0000-0000-000000000001',now()
)
on conflict(key) do update set
  value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at;

insert into public.inventory_locations(location_code,container_type,quantity)
values ('local','full',100),('route_1','full',0),('wash','empty',0),('damaged','damaged',0)
on conflict(location_code,container_type) do update set
  quantity=excluded.quantity,updated_at=now();

set local role authenticated;
set local request.jwt.claim.sub = '14000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"14000000-0000-0000-0000-000000000001","role":"authenticated"}';

select extensions.lives_ok(
  $$select public.start_round(
    '44000000-0000-0000-0000-000000000001',
    '34000000-0000-0000-0000-000000000001',
    '74000000-0000-0000-0000-000000000001',
    'ruta1',20,'QA initial load 20'
  )$$,
  'carga inicial 20: PASS'
);

select extensions.lives_ok(
  $$select public.register_sale(
    '44000000-0000-0000-0000-000000000002',
    '34000000-0000-0000-0000-000000000001',
    '64000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'client_id','','channel','ruta1','route','ruta1',
      'round_id','74000000-0000-0000-0000-000000000001',
      'cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='route_1' and container_type='full'),
      'quantity',20,'unit_price_cents',1400,'total_cents',28000,
      'paid_cents',28000,'credit_cents',0,'payment_method','transferencia'
    )
  )$$,
  'carga 20, venta 20: PASS'
);

-- Simulate one extra physical unit without a documented reload. The RPC must
-- still reject it using the round's documentary capacity.
reset role;
update public.inventory_locations
set quantity=1
where location_code='route_1' and container_type='full';
set local role authenticated;

select extensions.throws_ok(
  $$select public.register_sale(
    '44000000-0000-0000-0000-000000000003',
    '34000000-0000-0000-0000-000000000001',
    '64000000-0000-0000-0000-000000000002',
    jsonb_build_object(
      'client_id','','channel','ruta1','route','ruta1',
      'round_id','74000000-0000-0000-0000-000000000001',
      'cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='route_1' and container_type='full'),
      'quantity',1,'unit_price_cents',1400,'total_cents',1400,
      'paid_cents',1400,'credit_cents',0,'payment_method','transferencia'
    )
  )$$,
  '23514','round_capacity_exceeded',
  'intentar venta adicional 1 por RPC: REJECT'
);

reset role;
select extensions.is_empty(
  $$select id from public.sales where id='64000000-0000-0000-0000-000000000002'$$,
  'la sobreventa rechazada no deja venta parcial'
);
update public.inventory_locations
set quantity=0
where location_code='route_1' and container_type='full';

set local role authenticated;
select extensions.lives_ok(
  $$select public.reload_round(
    '44000000-0000-0000-0000-000000000004',
    '34000000-0000-0000-0000-000000000001',
    '74000000-0000-0000-0000-000000000001',20,'QA reload 20'
  )$$,
  'recarga 20: PASS'
);

reset role;
select extensions.results_eq(
  $$select quantity from public.inventory_movements
    where round_id='74000000-0000-0000-0000-000000000001'
      and movement_type='round_reload'$$,
  array[20],
  'la recarga queda como movimiento asociado al round_id'
);

set local role authenticated;
select extensions.lives_ok(
  $$select public.register_sale(
    '44000000-0000-0000-0000-000000000005',
    '34000000-0000-0000-0000-000000000001',
    '64000000-0000-0000-0000-000000000003',
    jsonb_build_object(
      'client_id','','channel','ruta1','route','ruta1',
      'round_id','74000000-0000-0000-0000-000000000001',
      'cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='route_1' and container_type='full'),
      'quantity',15,'unit_price_cents',1400,'total_cents',21000,
      'paid_cents',21000,'credit_cents',0,'payment_method','transferencia'
    )
  )$$,
  'carga 20 + recarga 20 + venta total 35: PASS'
);

reset role;
select extensions.results_eq(
  $$select initial_load,reloads,total_loaded,net_sold,available_full
    from app_private.round_capacity('74000000-0000-0000-0000-000000000001')$$,
  $$values (20,20,40,35,5)$$,
  'available_full = loaded_full + reloads - net_sold = 5'
);

select extensions.results_eq(
  $$select quantity from public.inventory_locations
    where location_code='route_1' and container_type='full'$$,
  array[5],
  'inventario físico de ruta también queda en 5'
);

set local role authenticated;
select extensions.lives_ok(
  $$select public.close_round(
    '44000000-0000-0000-0000-000000000006',
    '34000000-0000-0000-0000-000000000001',
    '74000000-0000-0000-0000-000000000001',5,35,0,0,'QA balanced close'
  )$$,
  'cierre con los 5 llenos esperados: PASS'
);

reset role;
select extensions.results_eq(
  $$select status,returned_full_qty from public.rounds
    where id='74000000-0000-0000-0000-000000000001'$$,
  $$values ('closed'::text,5)$$,
  'la ronda queda cerrada con regreso íntegro'
);

select extensions.results_eq(
  $$select quantity from public.inventory_locations
    where location_code='route_1' and container_type='full'$$,
  array[0],
  'el cierre retira los 5 llenos de la ruta'
);

select extensions.results_eq(
  $$select quantity from public.inventory_locations
    where location_code='local' and container_type='full'$$,
  array[65],
  'inventario local conserva 100 - 20 - 20 + 5 = 65'
);

select extensions.ok(
  not has_function_privilege(
    'anon','public.reload_round(uuid,uuid,uuid,integer,text)','execute'
  ),
  'anon no puede ejecutar reload_round'
);

select * from extensions.finish();
rollback;
