begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(29);

insert into auth.users(id,email)
values ('11000000-0000-0000-0000-000000000001','qa-v301-admin@example.invalid');
insert into public.profiles(id,auth_user_id,name,username,role,center,route,active)
values ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','QA V301 Admin','qa_v301_admin','administrador','local',null,true);
insert into public.devices(id,user_id,name,last_seen_at)
values ('31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','QA V301 device',now());

insert into public.inventory_locations(location_code,container_type,quantity)
values ('local','full',10),('route_1','full',0),('wash','empty',2)
on conflict(location_code,container_type) do update set quantity=excluded.quantity,updated_at=now();

select extensions.ok(not has_function_privilege('anon','public.close_cash_session(uuid,uuid,uuid,bigint,text)','execute'),'anon cannot close cash');
select extensions.ok(not has_function_privilege('anon','public.transfer_inventory(uuid,uuid,uuid,text,text,integer,text)','execute'),'anon cannot transfer inventory');
select extensions.ok(has_function_privilege('authenticated','public.close_cash_session(uuid,uuid,uuid,bigint,text)','execute'),'authenticated can call close cash API');
select extensions.ok(has_function_privilege('authenticated','public.fill_containers(uuid,uuid,uuid,integer,text)','execute'),'authenticated can call fill API');

set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated"}';

select extensions.lives_ok($$select public.create_client('41000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','{"name":"Cliente V301","phone":"","normal_route":"ninguna"}'::jsonb)$$,'creates client fixture through API');
select extensions.lives_ok($$select public.update_client('41000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001',1,'{"name":"Cliente V301 editado","phone":"","normal_route":"ninguna"}'::jsonb)$$,'updates client with expected version');
select extensions.results_eq($$select version from public.clients where id='51000000-0000-0000-0000-000000000001'$$,array[2],'client version increments');

select extensions.lives_ok($$select public.open_cash_session('41000000-0000-0000-0000-000000000010','31000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001',10000)$$,'opens central cash session');
select extensions.lives_ok($$select public.register_cash_movement('41000000-0000-0000-0000-000000000011','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','deposit','in',500,'QA deposit')$$,'registers central cash deposit');
select extensions.results_eq(
  $$select s.opening_cents + coalesce(sum(case m.direction when 'in' then m.amount_cents else -m.amount_cents end),0)::bigint from public.cash_sessions s left join public.cash_movements m on m.cash_session_id=s.id where s.id='61000000-0000-0000-0000-000000000001' group by s.id,s.opening_cents$$,
  array[10500::bigint],
  'cash expected includes deposit once'
);
select extensions.lives_ok($$select public.create_expense('41000000-0000-0000-0000-000000000012','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002','{"concept":"QA expense","amount_cents":1000,"center":"local","payment_method":"efectivo","affects_cash":true,"cash_session_id":"61000000-0000-0000-0000-000000000001"}'::jsonb)$$,'cash expense is transactional');
select extensions.results_eq(
  $$select s.opening_cents + coalesce(sum(case m.direction when 'in' then m.amount_cents else -m.amount_cents end),0)::bigint from public.cash_sessions s left join public.cash_movements m on m.cash_session_id=s.id where s.id='61000000-0000-0000-0000-000000000001' group by s.id,s.opening_cents$$,
  array[9500::bigint],
  'cash expected includes expense once'
);
select extensions.lives_ok($$select public.close_cash_session('41000000-0000-0000-0000-000000000013','31000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001',9500,'')$$,'closes balanced cash session');
select extensions.results_eq($$select status from public.cash_sessions where id='61000000-0000-0000-0000-000000000001'$$,array['closed'::text],'cash status is closed');

select extensions.lives_ok($$select public.transfer_inventory('41000000-0000-0000-0000-000000000020','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000020','local','ruta1',2,'QA transfer')$$,'transfers inventory atomically');
select extensions.results_eq($$select quantity from public.inventory_locations where location_code='local' and container_type='full'$$,array[8],'transfer decrements local');
select extensions.results_eq($$select quantity from public.inventory_locations where location_code='route_1' and container_type='full'$$,array[2],'transfer increments route');

select extensions.lives_ok($$select public.start_round('41000000-0000-0000-0000-000000000021','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000021','ruta1',3,'QA round')$$,'starts round and moves stock');
select extensions.lives_ok($$select public.close_round('41000000-0000-0000-0000-000000000022','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000021',3,0,0,0,'QA close')$$,'closes balanced round');
select extensions.results_eq($$select status from public.rounds where id='71000000-0000-0000-0000-000000000021'$$,array['closed'::text],'round status is closed');
select extensions.results_eq($$select quantity from public.inventory_locations where location_code='local' and container_type='full'$$,array[8],'round return restores local stock');

select extensions.lives_ok($$select public.upsert_supply('41000000-0000-0000-0000-000000000030','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000030','{"name":"QA Tapas V301","unit":"pieza","initial_stock":10,"minimum_stock":2,"cost_cents":20,"consumption_per_unit":1}'::jsonb)$$,'creates supply centrally');
select extensions.lives_ok($$select public.register_supply_movement('41000000-0000-0000-0000-000000000031','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000031','71000000-0000-0000-0000-000000000030','{"movement_type":"consumption","quantity":3,"reason":"QA consumption"}'::jsonb)$$,'consumes supply centrally');
select extensions.results_eq($$select current_stock from public.supplies where id='71000000-0000-0000-0000-000000000030'$$,array[7::numeric],'supply balance is authoritative');
select extensions.lives_ok($$select public.fill_containers('41000000-0000-0000-0000-000000000032','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000032',2,'QA fill')$$,'fills containers transactionally');
select extensions.lives_ok($$select public.fill_containers('41000000-0000-0000-0000-000000000032','31000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000032',2,'QA fill')$$,'fill retry is idempotent');
select extensions.results_eq($$select quantity from public.inventory_locations where location_code='wash' and container_type='empty'$$,array[0],'fill consumes empty containers once');
select extensions.results_eq($$select quantity from public.inventory_locations where location_code='local' and container_type='full'$$,array[10],'fill creates full containers once');
select extensions.results_eq($$select current_stock from public.supplies where id='71000000-0000-0000-0000-000000000030'$$,array[5::numeric],'fill consumes configured supplies once');

select * from extensions.finish();
rollback;
