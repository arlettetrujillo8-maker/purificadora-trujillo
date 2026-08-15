begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(25);

insert into auth.users(id,email)
values
  ('10000000-0000-0000-0000-000000000001','qa-admin-v3@example.invalid'),
  ('10000000-0000-0000-0000-000000000002','qa-window-v3@example.invalid'),
  ('10000000-0000-0000-0000-000000000003','qa-route2-v3@example.invalid');

insert into public.profiles(id,auth_user_id,name,username,role,center,route,active)
values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','QA Admin','qa_admin_v3','administrador','local',null,true),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','QA Ventanilla','qa_window_v3','ventanilla','local',null,true),
  ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','QA Ruta 2','qa_route2_v3','repartidor','ruta2','ruta2',true);

insert into public.devices(id,user_id,name,last_seen_at)
values
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','QA admin device',now()),
  ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','QA window device',now()),
  ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','QA route2 device',now());

insert into public.inventory_locations(location_code,container_type,quantity)
values ('local','full',20)
on conflict(location_code,container_type)
do update set quantity=20,updated_at=now();

select extensions.ok(
  not has_table_privilege('anon','public.clients','select'),
  'anon cannot select clients'
);
select extensions.ok(
  not has_function_privilege('anon','public.register_sale(uuid,uuid,uuid,jsonb)','execute'),
  'anon cannot execute register_sale'
);
select extensions.ok(
  has_function_privilege('authenticated','app_private.current_profile_id()','execute'),
  'authenticated can execute the RLS identity helper'
);
select extensions.ok(
  not has_function_privilege('authenticated','app_private.next_folio(text)','execute'),
  'authenticated cannot execute next_folio directly'
);
select extensions.ok(
  not has_function_privilege('authenticated','app_private.claim_operation(uuid,uuid,text,jsonb)','execute'),
  'authenticated cannot claim operations directly'
);
select extensions.ok(
  not has_function_privilege('authenticated','app_private.complete_operation(uuid,jsonb)','execute'),
  'authenticated cannot complete operations directly'
);
select extensions.ok(
  not has_function_privilege('authenticated','app_private.can_operate(text)','execute'),
  'authenticated cannot execute the authorization helper directly'
);
select extensions.ok(
  not has_table_privilege('authenticated','public.audit_log','delete'),
  'authenticated cannot delete audit entries'
);
select extensions.ok(
  not has_table_privilege('authenticated','public.settings','update'),
  'authenticated cannot update settings directly'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';

select extensions.is(
  app_private.current_profile_id(),
  '20000000-0000-0000-0000-000000000002'::uuid,
  'current_profile_id resolves the active Ventanilla profile'
);
select extensions.results_eq(
  'select count(*) from public.profiles',
  array[1::bigint],
  'Ventanilla only sees its own profile'
);

select extensions.lives_ok(
  $$select public.create_client(
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000001',
    '{"name":"Cliente solo nombre","phone":"","address":"","normal_route":"ninguna"}'::jsonb
  )$$,
  'Ventanilla can create a client with only a name'
);
select extensions.lives_ok(
  $$select public.create_client(
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000001',
    '{"name":"Cliente solo nombre","phone":"","address":"","normal_route":"ninguna"}'::jsonb
  )$$,
  'Retrying create_client with the same operation is idempotent'
);
select extensions.results_eq(
  $$select count(*) from public.clients where id='50000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'The client retry creates one row'
);
select extensions.results_eq(
  $$select count(*) from public.audit_log where entity_id='50000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'The client retry creates one audit row'
);

select extensions.lives_ok(
  $$select public.register_sale(
    '40000000-0000-0000-0000-000000000010',
    '30000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'client_id','',
      'channel','ventanilla',
      'route','',
      'round_id','',
      'cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),
      'quantity',2,
      'unit_price_cents',1400,
      'total_cents',2800,
      'paid_cents',2800,
      'credit_cents',0,
      'payment_method','transferencia',
      'notes','QA transaction'
    )
  )$$,
  'Ventanilla can register a transfer sale against local inventory'
);
select extensions.lives_ok(
  $$select public.register_sale(
    '40000000-0000-0000-0000-000000000010',
    '30000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'client_id','',
      'channel','ventanilla',
      'route','',
      'round_id','',
      'cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),
      'quantity',2,
      'unit_price_cents',1400,
      'total_cents',2800,
      'paid_cents',2800,
      'credit_cents',0,
      'payment_method','transferencia',
      'notes','QA transaction'
    )
  )$$,
  'Retrying register_sale with the same operation is idempotent'
);
select extensions.results_eq(
  $$select count(*) from public.sales where operation_id='40000000-0000-0000-0000-000000000010'$$,
  array[1::bigint],
  'The sale retry creates one sale'
);
select extensions.results_eq(
  $$select count(*) from public.inventory_movements where operation_id='40000000-0000-0000-0000-000000000010'$$,
  array[1::bigint],
  'The sale retry creates one inventory effect'
);
select extensions.results_eq(
  $$select quantity from public.inventory_locations where location_code='local' and container_type='full'$$,
  array[18],
  'The sale retry decrements stock once'
);
select extensions.throws_ok(
  $$select public.register_sale(
    '40000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000002',
    jsonb_build_object(
      'client_id','', 'channel','ventanilla', 'route','', 'round_id','',
      'cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),
      'quantity',99, 'unit_price_cents',1400, 'total_cents',138600,
      'paid_cents',138600, 'credit_cents',0, 'payment_method','transferencia'
    )
  )$$,
  '23514',
  'insufficient_inventory',
  'The backend rejects stock below zero'
);
select extensions.results_eq(
  $$select count(*) from public.operations where id='40000000-0000-0000-0000-000000000011'$$,
  array[0::bigint],
  'A failed sale leaves no partial operation'
);

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

select extensions.throws_ok(
  $$select public.register_sale(
    '40000000-0000-0000-0000-000000000020',
    '30000000-0000-0000-0000-000000000003',
    '60000000-0000-0000-0000-000000000003',
    jsonb_build_object(
      'client_id','', 'channel','ruta1', 'route','ruta1', 'round_id','',
      'cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),
      'quantity',1, 'unit_price_cents',1400, 'total_cents',1400,
      'paid_cents',1400, 'credit_cents',0, 'payment_method','transferencia'
    )
  )$$,
  '42501',
  'route_scope_violation',
  'Ruta 2 cannot operate as Ruta 1'
);
select extensions.results_eq(
  $$select count(*) from public.sales
    where id='60000000-0000-0000-0000-000000000001'$$,
  array[0::bigint],
  'Ruta 2 cannot read the Ventanilla sale'
);

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select extensions.results_eq(
  $$select count(*) from public.profiles where username in ('qa_admin_v3','qa_window_v3','qa_route2_v3')$$,
  array[3::bigint],
  'Administrator can read all QA profiles'
);

select * from extensions.finish();
rollback;
