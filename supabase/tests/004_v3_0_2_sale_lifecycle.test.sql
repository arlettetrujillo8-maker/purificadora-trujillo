begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(32);

insert into auth.users(id,email) values ('12000000-0000-0000-0000-000000000001','qa-v302-admin@example.invalid');
insert into public.profiles(id,auth_user_id,name,username,role,center,active)
values ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','QA V302 Admin','qa_v302_admin','administrador','local',true);
insert into public.devices(id,user_id,name,last_seen_at)
values ('32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','QA V302 device',now());
insert into public.clients(id,name,normal_route,created_by)
values ('52000000-0000-0000-0000-000000000001','Cliente V302','ninguna','22000000-0000-0000-0000-000000000001');
insert into public.inventory_locations(location_code,container_type,quantity)
values ('local','full',100),('wash','empty',10)
on conflict(location_code,container_type) do update set quantity=excluded.quantity,updated_at=now();

select extensions.ok(not has_function_privilege('anon','public.return_sale(uuid,uuid,uuid,uuid,integer,uuid,text)','execute'),'anon cannot return sales');
select extensions.ok(not has_function_privilege('anon','public.correct_sale(uuid,uuid,uuid,uuid,uuid,jsonb)','execute'),'anon cannot correct sales');
select extensions.ok(not has_function_privilege('anon','public.void_sale(uuid,uuid,uuid,uuid,uuid,text)','execute'),'anon cannot void sales');
select extensions.ok(has_function_privilege('authenticated','public.return_sale(uuid,uuid,uuid,uuid,integer,uuid,text)','execute'),'authenticated return API exists');

set local role authenticated;
set local request.jwt.claim.sub = '12000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"12000000-0000-0000-0000-000000000001","role":"authenticated"}';

select extensions.lives_ok($$select public.open_cash_session('42000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001',100000)$$,'opens cash for lifecycle QA');
select extensions.lives_ok($$select public.register_sale('42000000-0000-0000-0000-000000000010','32000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000010',jsonb_build_object('client_id','52000000-0000-0000-0000-000000000001','channel','ventanilla','route','','round_id','','cash_session_id','62000000-0000-0000-0000-000000000001','inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),'quantity',5,'unit_price_cents',1400,'total_cents',7000,'paid_cents',7000,'credit_cents',0,'payment_method','efectivo','notes','QA cash sale'))$$,'creates cash sale');
select extensions.lives_ok($$select public.return_sale('42000000-0000-0000-0000-000000000011','32000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000011','62000000-0000-0000-0000-000000000010',2,'62000000-0000-0000-0000-000000000001','QA partial return')$$,'returns part of cash sale');
select extensions.lives_ok($$select public.return_sale('42000000-0000-0000-0000-000000000011','32000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000011','62000000-0000-0000-0000-000000000010',2,'62000000-0000-0000-0000-000000000001','QA partial return')$$,'return retry is idempotent');
select extensions.results_eq($$select count(*) from public.sale_returns where sale_id='62000000-0000-0000-0000-000000000010'$$,array[1::bigint],'one return row after retry');
select extensions.results_eq($$select sum(quantity) from public.sale_returns where sale_id='62000000-0000-0000-0000-000000000010'$$,array[2::bigint],'partial return quantity persisted');
select extensions.results_eq($$select sum(amount_cents)::bigint from public.cash_movements where reference_type='sale_return' and reference_id='72000000-0000-0000-0000-000000000011'$$,array[2800::bigint],'cash refund recorded once');
select extensions.results_eq($$select status from public.sales where id='62000000-0000-0000-0000-000000000010'$$,array['active'::text],'partial return keeps sale active');
select extensions.throws_like($$select public.return_sale('42000000-0000-0000-0000-000000000012','32000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000012','62000000-0000-0000-0000-000000000010',4,'62000000-0000-0000-0000-000000000001','too much')$$,'%return_quantity_exceeded%','excessive return is rejected');

select extensions.lives_ok($$select public.register_sale('42000000-0000-0000-0000-000000000020','32000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000020',jsonb_build_object('client_id','52000000-0000-0000-0000-000000000001','channel','ventanilla','route','','round_id','','cash_session_id','','inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),'quantity',3,'unit_price_cents',1400,'total_cents',4200,'paid_cents',0,'credit_cents',4200,'payment_method','fiado','notes','QA credit sale'))$$,'creates credit sale');
select extensions.lives_ok($$select public.return_sale('42000000-0000-0000-0000-000000000021','32000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000021','62000000-0000-0000-0000-000000000020',2,null,'QA credit return')$$,'returns credit sale without cash');
select extensions.results_eq($$select sum(amount_cents)::bigint from public.ledger_entries where sale_id='62000000-0000-0000-0000-000000000020'$$,array[1400::bigint],'credit return leaves only one unit owed');

select extensions.lives_ok($$select public.register_sale('42000000-0000-0000-0000-000000000030','32000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000030',jsonb_build_object('client_id','','channel','ventanilla','route','','round_id','','cash_session_id','62000000-0000-0000-0000-000000000001','inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),'quantity',4,'unit_price_cents',1400,'total_cents',5600,'paid_cents',5600,'credit_cents',0,'payment_method','efectivo','notes','before correction'))$$,'creates sale to correct');
select extensions.lives_ok($$select public.correct_sale('42000000-0000-0000-0000-000000000031','32000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000031','62000000-0000-0000-0000-000000000031','62000000-0000-0000-0000-000000000030',jsonb_build_object('reason','QA quantity correction','client_id','','channel','ventanilla','round_id','','cash_session_id','62000000-0000-0000-0000-000000000001','quantity',3,'unit_price_cents',1400,'total_cents',4200,'paid_cents',4200,'credit_cents',0,'payment_method','efectivo','notes','after correction'))$$,'corrects sale atomically');
select extensions.results_eq($$select status from public.sales where id='62000000-0000-0000-0000-000000000030'$$,array['corrected'::text],'original sale is corrected');
select extensions.results_eq($$select status from public.sales where id='62000000-0000-0000-0000-000000000031'$$,array['active'::text],'replacement sale is active');
select extensions.results_eq($$select count(*) from public.sale_corrections where original_sale_id='62000000-0000-0000-0000-000000000030'$$,array[1::bigint],'correction history is append only');

select extensions.lives_ok($$select public.register_sale('42000000-0000-0000-0000-000000000040','32000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000040',jsonb_build_object('client_id','','channel','ventanilla','route','','round_id','','cash_session_id','62000000-0000-0000-0000-000000000001','inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),'quantity',2,'unit_price_cents',1400,'total_cents',2800,'paid_cents',2800,'credit_cents',0,'payment_method','efectivo','notes','before void'))$$,'creates sale to void');
select extensions.lives_ok($$select public.void_sale('42000000-0000-0000-0000-000000000041','32000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000041','62000000-0000-0000-0000-000000000040','62000000-0000-0000-0000-000000000001','QA void')$$,'voids sale atomically');
select extensions.results_eq($$select status from public.sales where id='62000000-0000-0000-0000-000000000040'$$,array['voided'::text],'void keeps sale as historical row');

-- Establish a transaction-local service boundary so production records already
-- present in the linked project do not affect this test's counter.
select public.register_maintenance_service(
  '42000000-0000-0000-0000-000000000049',
  '32000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000049',
  'QA maintenance baseline'
);
reset role;
update public.maintenance_events
set created_at=now()-interval '1 second'
where id='72000000-0000-0000-0000-000000000049';
set local role authenticated;
select extensions.lives_ok($$select public.fill_containers('42000000-0000-0000-0000-000000000050','32000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000050',2,'QA production')$$,'records production for maintenance counter');
select extensions.lives_ok($$select public.register_sale('42000000-0000-0000-0000-000000000052','32000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000052',jsonb_build_object('client_id','','channel','ventanilla','route','','round_id','','cash_session_id','62000000-0000-0000-0000-000000000001','inventory_location_id',(select id::text from public.inventory_locations where location_code='local' and container_type='full'),'quantity',1,'unit_price_cents',1400,'total_cents',1400,'paid_cents',1400,'credit_cents',0,'payment_method','efectivo','occurred_at',(now()+interval '5 minutes'),'notes','QA maintenance sale with future device time'))$$,'sale advances maintenance counter despite future device time');
select extensions.lives_ok($$select public.register_maintenance_service('42000000-0000-0000-0000-000000000051','32000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000051','QA service')$$,'registers maintenance service');
select extensions.results_eq($$select previous_count from public.maintenance_events where id='72000000-0000-0000-0000-000000000051'$$,array[1],'maintenance stores net sales since prior service');
select extensions.lives_ok($$select public.register_maintenance_service('42000000-0000-0000-0000-000000000053','32000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000053','QA immediate second service')$$,'second maintenance reset is accepted');
select extensions.results_eq($$select previous_count from public.maintenance_events where id='72000000-0000-0000-0000-000000000053'$$,array[0],'future device time does not survive a server-time reset');
select extensions.lives_ok($$select public.register_maintenance_service('42000000-0000-0000-0000-000000000051','32000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000051','QA service')$$,'maintenance retry is idempotent');
select extensions.results_eq($$select count(*) from public.maintenance_events where id='72000000-0000-0000-0000-000000000051'$$,array[1::bigint],'maintenance retry creates one row');

select * from extensions.finish();
rollback;
