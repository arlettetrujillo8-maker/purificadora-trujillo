begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(4);

insert into auth.users(id,email) values
  ('15000000-0000-0000-0000-000000000001','qa-inventory-mobile@example.invalid');

insert into public.profiles(
  id,auth_user_id,name,username,role,center,permissions,active
) values (
  '25000000-0000-0000-0000-000000000001',
  '15000000-0000-0000-0000-000000000001',
  'QA Inventario Móvil','qa_inventory_mobile','administrador','local','{}',true
);

insert into public.devices(id,user_id,name,last_seen_at) values (
  '35000000-0000-0000-0000-000000000001',
  '25000000-0000-0000-0000-000000000001',
  'QA inventory mobile device',now()
);

insert into public.inventory_locations(location_code,container_type,quantity)
values ('local','full',50),('route_1','full',10)
on conflict(location_code,container_type) do update set
  quantity=excluded.quantity,updated_at=now();

set local role authenticated;
set local request.jwt.claim.sub = '15000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"15000000-0000-0000-0000-000000000001","role":"authenticated"}';

select extensions.lives_ok(
  $$select public.adjust_inventory(
    '45000000-0000-0000-0000-000000000001',
    '35000000-0000-0000-0000-000000000001',
    '75000000-0000-0000-0000-000000000001',
    'local',300,'QA conteo físico 50 a 300'
  )$$,
  'ajustar Local llenos de 50 a 300: PASS'
);

reset role;
select extensions.results_eq(
  $$select quantity from public.inventory_locations
    where location_code='local' and container_type='full'$$,
  array[300],
  'el inventario central refleja el nuevo total'
);

set local role authenticated;
select extensions.throws_ok(
  $$select public.transfer_inventory(
    '45000000-0000-0000-0000-000000000002',
    '35000000-0000-0000-0000-000000000001',
    '75000000-0000-0000-0000-000000000002',
    'local','local',1,'QA mismo origen y destino'
  )$$,
  '22023','invalid_inventory_transfer',
  'mismo origen y destino en transferencia: REJECT'
);

reset role;
select extensions.results_eq(
  $$select count(*) from public.inventory_movements
    where reference_id='75000000-0000-0000-0000-000000000002'$$,
  array[0::bigint],
  'la transferencia rechazada no deja movimientos'
);

select * from extensions.finish();
rollback;
