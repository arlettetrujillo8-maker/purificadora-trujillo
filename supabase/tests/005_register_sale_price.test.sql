begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(16);

insert into auth.users(id,email) values
  ('13000000-0000-0000-0000-000000000001','qa-price-basic@example.invalid'),
  ('13000000-0000-0000-0000-000000000002','qa-price-override@example.invalid');

insert into public.profiles(
  id,auth_user_id,name,username,role,center,permissions,active
) values
  ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','QA Price Basic','qa_price_basic','ventanilla','local','{}',true),
  ('23000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000002','QA Price Override','qa_price_override','ventanilla','local',array['override_sale_price'],true);

insert into public.devices(id,user_id,name,last_seen_at) values
  ('33000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','QA price basic device',now()),
  ('33000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000002','QA price override device',now());

insert into public.clients(
  id,name,normal_route,client_type,special_price_cents,created_by
) values
  ('53000000-0000-0000-0000-000000000001','Cliente precio 800','ventanilla','special',800,'23000000-0000-0000-0000-000000000001'),
  ('53000000-0000-0000-0000-000000000002','Cliente precio general','ventanilla','general',null,'23000000-0000-0000-0000-000000000001');

insert into public.settings(key,value,updated_by,updated_at)
values ('pricing',jsonb_build_object('default_price_cents',1400),'23000000-0000-0000-0000-000000000001',now())
on conflict(key) do update
set value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at;

insert into public.inventory_locations(location_code,container_type,quantity)
values ('local','full',100)
on conflict(location_code,container_type) do update
set quantity=excluded.quantity,updated_at=now();

set local role authenticated;
set local request.jwt.claim.sub = '13000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"13000000-0000-0000-0000-000000000001","role":"authenticated"}';

select extensions.lives_ok(
  $$select public.register_sale(
    '43000000-0000-0000-0000-000000000001',
    '33000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'client_id','53000000-0000-0000-0000-000000000001',
      'channel','ventanilla','route','','round_id','','cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),
      'quantity',1,'unit_price_cents',800,'total_cents',800,
      'paid_cents',800,'credit_cents',0,'payment_method','transferencia'
    )
  )$$,
  'cliente con precio especial 800 acepta venta a 800'
);

select extensions.results_eq(
  $$select unit_price_cents from public.sales where id='63000000-0000-0000-0000-000000000001'$$,
  array[800::bigint],
  'el precio especial se conserva en centavos enteros'
);

select extensions.throws_ok(
  $$select public.register_sale(
    '43000000-0000-0000-0000-000000000002',
    '33000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000002',
    jsonb_build_object(
      'client_id','53000000-0000-0000-0000-000000000001',
      'channel','ventanilla','route','','round_id','','cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),
      'quantity',1,'unit_price_cents',1000,'total_cents',1000,
      'paid_cents',1000,'credit_cents',0,'payment_method','transferencia',
      'price_override_reason','Intento no autorizado'
    )
  )$$,
  '42501',
  'price_override_not_authorized',
  'precio 1000 sin permiso es rechazado por el backend'
);

select extensions.results_eq(
  $$select count(*) from public.operations where id='43000000-0000-0000-0000-000000000002'$$,
  array[0::bigint],
  'el rechazo revierte el claim idempotente dentro de la transaccion'
);

set local request.jwt.claim.sub = '13000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"13000000-0000-0000-0000-000000000002","role":"authenticated"}';

select extensions.throws_ok(
  $$select public.register_sale(
    '43000000-0000-0000-0000-000000000005',
    '33000000-0000-0000-0000-000000000002',
    '63000000-0000-0000-0000-000000000005',
    jsonb_build_object(
      'client_id','53000000-0000-0000-0000-000000000001',
      'channel','ventanilla','route','','round_id','','cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),
      'quantity',1,'unit_price_cents',1000,'total_cents',1000,
      'paid_cents',1000,'credit_cents',0,'payment_method','transferencia'
    )
  )$$,
  '23514',
  'price_override_reason_required',
  'el permiso no basta: el motivo es obligatorio'
);

select extensions.results_eq(
  $$select count(*) from public.operations where id='43000000-0000-0000-0000-000000000005'$$,
  array[0::bigint],
  'el rechazo por falta de motivo tampoco deja efectos parciales'
);

select extensions.lives_ok(
  $$select public.register_sale(
    '43000000-0000-0000-0000-000000000003',
    '33000000-0000-0000-0000-000000000002',
    '63000000-0000-0000-0000-000000000003',
    jsonb_build_object(
      'client_id','53000000-0000-0000-0000-000000000001',
      'channel','ventanilla','route','','round_id','','cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),
      'quantity',1,'unit_price_cents',1000,'total_cents',1000,
      'paid_cents',1000,'credit_cents',0,'payment_method','transferencia',
      'price_override_reason','Contrato mayorista autorizado'
    )
  )$$,
  'precio distinto con permiso y motivo es aceptado'
);

select extensions.results_eq(
  $$select unit_price_cents from public.sales where id='63000000-0000-0000-0000-000000000003'$$,
  array[1000::bigint],
  'el precio manual autorizado queda almacenado'
);

select extensions.results_eq(
  $$select (before_data->>'expected_price_cents') || '|' || (after_data->>'unit_price_cents') || '|' || reason
    from public.audit_log
    where action='sale_price_overridden' and entity_id='63000000-0000-0000-0000-000000000003'$$,
  array['800|1000|Contrato mayorista autorizado'::text],
  'la auditoria registra precio esperado, usado y motivo'
);

select extensions.lives_ok(
  $$select public.register_sale(
    '43000000-0000-0000-0000-000000000004',
    '33000000-0000-0000-0000-000000000002',
    '63000000-0000-0000-0000-000000000004',
    jsonb_build_object(
      'client_id','53000000-0000-0000-0000-000000000002',
      'channel','ventanilla','route','','round_id','','cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),
      'quantity',1,'unit_price_cents',1400,'total_cents',1400,
      'paid_cents',1400,'credit_cents',0,'payment_method','transferencia'
    )
  )$$,
  'cliente sin precio especial usa el precio general vigente'
);

select extensions.results_eq(
  $$select unit_price_cents from public.sales where id='63000000-0000-0000-0000-000000000004'$$,
  array[1400::bigint],
  'el precio general vigente queda almacenado'
);

select extensions.lives_ok(
  $$select public.register_sale(
    '43000000-0000-0000-0000-000000000003',
    '33000000-0000-0000-0000-000000000002',
    '63000000-0000-0000-0000-000000000003',
    jsonb_build_object(
      'client_id','53000000-0000-0000-0000-000000000001',
      'channel','ventanilla','route','','round_id','','cash_session_id','',
      'inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),
      'quantity',1,'unit_price_cents',1000,'total_cents',1000,
      'paid_cents',1000,'credit_cents',0,'payment_method','transferencia',
      'price_override_reason','Contrato mayorista autorizado'
    )
  )$$,
  'retry de la misma venta devuelve el resultado previo'
);

select extensions.results_eq(
  $$select count(*) from public.sales where operation_id='43000000-0000-0000-0000-000000000003'$$,
  array[1::bigint],
  'el retry no duplica la venta'
);

select extensions.results_eq(
  $$select count(*) from public.inventory_movements where operation_id='43000000-0000-0000-0000-000000000003'$$,
  array[1::bigint],
  'el retry no duplica el movimiento de inventario'
);

select extensions.results_eq(
  $$select count(*) from public.audit_log where action='sale_price_overridden' and entity_id='63000000-0000-0000-0000-000000000003'$$,
  array[1::bigint],
  'el retry no duplica la auditoria de precio'
);

select extensions.results_eq(
  $$select quantity from public.inventory_locations where location_code='local' and container_type='full'$$,
  array[97],
  'solo las tres ventas aceptadas descuentan inventario'
);

select * from extensions.finish();
rollback;
