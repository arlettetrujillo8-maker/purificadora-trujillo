-- Purificadora Trujillo V3.0.2
-- Non-destructive, transactional sale returns/corrections/voids.

create table if not exists public.sale_returns (
  id uuid primary key,
  sale_id uuid not null references public.sales(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  total_cents bigint not null check (total_cents >= 0),
  refund_cents bigint not null default 0 check (refund_cents >= 0),
  credit_reversal_cents bigint not null default 0 check (credit_reversal_cents >= 0),
  refund_method text not null check (refund_method in ('efectivo','transferencia','sin_reembolso')),
  cash_session_id uuid references public.cash_sessions(id) on delete restrict,
  reason text not null check (length(trim(reason)) > 0),
  user_id uuid not null references public.profiles(id) on delete restrict,
  device_id uuid not null references public.devices(id) on delete restrict,
  operation_id uuid not null unique references public.operations(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint sale_returns_amounts_match check (refund_cents + credit_reversal_cents = total_cents),
  constraint sale_returns_cash_shape check (
    (refund_method = 'efectivo' and refund_cents > 0 and cash_session_id is not null)
    or refund_method <> 'efectivo'
    or refund_cents = 0
  )
);

alter table public.sales
  add column if not exists cash_accounting text not null default 'normal';
alter table public.sales
  drop constraint if exists sales_cash_accounting_check;
alter table public.sales
  add constraint sales_cash_accounting_check
  check (cash_accounting in ('normal','adjustment_only'));
alter table public.sales
  drop constraint if exists sales_cash_session_check;
alter table public.sales
  add constraint sales_cash_session_check check (
    cash_accounting = 'adjustment_only'
    or (payment_method in ('efectivo','mixto') and paid_cents > 0 and cash_session_id is not null)
    or payment_method not in ('efectivo','mixto')
    or paid_cents = 0
  );

create index if not exists sale_returns_sale_idx
  on public.sale_returns(sale_id, created_at);

-- A sale can have several partial-return reversals. Only its original charge
-- remains unique; reversal rows are append-only and idempotent by operation.
drop index if exists public.ledger_sale_effect_idx;
create unique index if not exists ledger_sale_charge_effect_idx
  on public.ledger_entries(sale_id, entry_type)
  where sale_id is not null and entry_type='charge';

create table if not exists public.sale_cash_adjustments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  correction_id uuid not null references public.sale_corrections(id) on delete restrict,
  original_cash_session_id uuid references public.cash_sessions(id) on delete restrict,
  applied_cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  amount_cents bigint not null check (amount_cents <> 0),
  post_close boolean not null default false,
  reason text not null check (length(trim(reason)) > 0),
  user_id uuid not null references public.profiles(id) on delete restrict,
  device_id uuid not null references public.devices(id) on delete restrict,
  operation_id uuid not null unique references public.operations(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.cash_movements
  drop constraint if exists cash_movements_movement_type_check;
alter table public.cash_movements
  add constraint cash_movements_movement_type_check check (
    movement_type in (
      'cash_sale','debt_payment','cash_expense','refund','withdrawal','deposit',
      'route_handover','adjustment','post_close_adjustment'
    )
  );

alter table public.sale_returns enable row level security;
alter table public.sale_cash_adjustments enable row level security;

drop policy if exists sale_returns_read on public.sale_returns;
create policy sale_returns_read on public.sale_returns for select to authenticated
using (
  app_private.is_admin()
  or user_id = app_private.current_profile_id()
  or exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (
        s.user_id = app_private.current_profile_id()
        or s.route = app_private.current_route()
        or (app_private.current_role() in ('ventanilla','caja') and s.channel in ('ventanilla','fuera_horario','fuera_ruta'))
      )
  )
);

drop policy if exists sale_cash_adjustments_read on public.sale_cash_adjustments;
create policy sale_cash_adjustments_read on public.sale_cash_adjustments for select to authenticated
using (app_private.is_admin() or user_id = app_private.current_profile_id());

drop policy if exists corrections_read on public.sale_corrections;
create policy corrections_read on public.sale_corrections for select to authenticated
using (
  app_private.is_admin()
  or created_by = app_private.current_profile_id()
  or exists (
    select 1 from public.sales s
    where s.id = original_sale_id
      and (s.user_id = app_private.current_profile_id() or s.route = app_private.current_route())
  )
);

revoke all on public.sale_returns, public.sale_cash_adjustments from public, anon, authenticated;
grant select on public.sale_returns, public.sale_cash_adjustments to authenticated;

create or replace function app_private.sale_location_id(
  p_channel text,
  p_round_id uuid default null,
  p_reversal boolean default false
) returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_round_status text;
begin
  if p_channel in ('ventanilla','fuera_ruta','fuera_horario') then
    return app_private.inventory_location_id('local');
  end if;
  if p_channel not in ('ruta1','ruta2') then
    raise exception 'invalid_sale_channel' using errcode='22023';
  end if;
  if p_round_id is not null then
    select status into v_round_status from public.rounds where id=p_round_id;
  end if;
  if p_reversal and v_round_status='closed' then
    return app_private.inventory_location_id('local');
  end if;
  return app_private.inventory_location_id(p_channel);
end;
$$;

revoke all on function app_private.sale_location_id(text,uuid,boolean)
  from public, anon, authenticated;

create or replace function public.return_sale(
  p_operation_id uuid,
  p_device_id uuid,
  p_return_id uuid,
  p_sale_id uuid,
  p_quantity integer,
  p_cash_session_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_sale public.sales;
  v_return public.sale_returns;
  v_cached jsonb;
  v_payload jsonb;
  v_prior_qty integer;
  v_prior_credit bigint;
  v_target_credit bigint;
  v_credit bigint;
  v_total bigint;
  v_refund bigint;
  v_refund_method text;
  v_location_id uuid;
  v_session public.cash_sessions;
  v_balance bigint;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('return_sale') then
    raise exception 'operation_not_authorized' using errcode='42501';
  end if;
  if p_quantity is null or p_quantity<=0 or length(trim(coalesce(p_reason,'')))=0 then
    raise exception 'invalid_sale_return' using errcode='22023';
  end if;

  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale.id is null then raise exception 'sale_not_found' using errcode='P0002'; end if;
  if v_actor.role<>'administrador' and v_sale.user_id<>v_actor.id then
    raise exception 'sale_scope_violation' using errcode='42501';
  end if;
  if v_actor.role<>'administrador'
     and v_sale.occurred_at < now()-interval '30 minutes'
     and not exists(select 1 from public.cash_sessions c where c.id=v_sale.cash_session_id and c.status='open' and c.user_id=v_actor.id) then
    raise exception 'sale_change_window_expired' using errcode='42501';
  end if;

  v_payload:=jsonb_build_object('return_id',p_return_id,'sale_id',p_sale_id,'quantity',p_quantity,'cash_session_id',p_cash_session_id,'reason',trim(p_reason));
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'return_sale',v_payload);
  if v_cached is not null then return v_cached; end if;

  if v_sale.status<>'active' then raise exception 'sale_not_returnable' using errcode='55000'; end if;
  select coalesce(sum(quantity),0)::integer,coalesce(sum(credit_reversal_cents),0)::bigint
    into v_prior_qty,v_prior_credit from public.sale_returns where sale_id=v_sale.id;
  if v_prior_qty+p_quantity>v_sale.quantity then
    raise exception 'return_quantity_exceeded' using errcode='23514';
  end if;

  v_total:=p_quantity::bigint*v_sale.unit_price_cents;
  v_target_credit:=round(v_sale.credit_cents::numeric*(v_prior_qty+p_quantity)::numeric/v_sale.quantity::numeric)::bigint;
  v_credit:=v_target_credit-v_prior_credit;
  v_refund:=v_total-v_credit;
  v_refund_method:=case
    when v_refund=0 then 'sin_reembolso'
    when v_sale.payment_method='transferencia' then 'transferencia'
    when v_sale.payment_method in ('efectivo','mixto') then 'efectivo'
    else 'sin_reembolso'
  end;

  if v_credit>0 and v_sale.client_id is not null then
    select coalesce(sum(amount_cents),0)::bigint into v_balance
    from public.ledger_entries where client_id=v_sale.client_id;
    if v_balance<v_credit then raise exception 'sale_credit_already_paid' using errcode='23514'; end if;
  end if;

  if v_refund_method='efectivo' and v_refund>0 then
    select * into v_session from public.cash_sessions where id=p_cash_session_id for update;
    if v_session.id is null or v_session.status<>'open' or v_session.user_id<>v_actor.id then
      raise exception 'cash_session_required' using errcode='42501';
    end if;
    if app_private.cash_expected_cents(v_session.id)<v_refund then
      raise exception 'insufficient_cash' using errcode='23514';
    end if;
  else
    p_cash_session_id:=null;
  end if;

  v_location_id:=app_private.sale_location_id(v_sale.channel,v_sale.round_id,true);
  perform 1 from public.inventory_locations where id=v_location_id for update;
  update public.inventory_locations set quantity=quantity+p_quantity,updated_at=now() where id=v_location_id;

  insert into public.sale_returns(
    id,sale_id,quantity,total_cents,refund_cents,credit_reversal_cents,
    refund_method,cash_session_id,reason,user_id,device_id,operation_id
  ) values (
    p_return_id,v_sale.id,p_quantity,v_total,v_refund,v_credit,v_refund_method,
    p_cash_session_id,trim(p_reason),v_actor.id,p_device_id,p_operation_id
  ) returning * into v_return;

  insert into public.inventory_movements(
    container_type,to_location_id,quantity,movement_type,reference_type,
    reference_id,round_id,user_id,operation_id
  ) values ('full',v_location_id,p_quantity,'sale_return','sale_return',v_return.id,v_sale.round_id,v_actor.id,p_operation_id);

  if v_credit>0 then
    insert into public.ledger_entries(client_id,entry_type,amount_cents,sale_id,reason,created_by,operation_id)
    values(v_sale.client_id,'reversal',-v_credit,v_sale.id,'Devolución: '||trim(p_reason),v_actor.id,p_operation_id);
  end if;
  if v_refund_method='efectivo' and v_refund>0 then
    insert into public.cash_movements(cash_session_id,movement_type,direction,amount_cents,reference_type,reference_id,user_id,operation_id)
    values(v_session.id,'refund','out',v_refund,'sale_return',v_return.id,v_actor.id,p_operation_id);
  end if;

  insert into public.audit_log(user_id,device_id,action,entity,entity_id,before_data,after_data,reason)
  values(v_actor.id,p_device_id,'sale_returned','sale_return',v_return.id,
    jsonb_build_object('sale',to_jsonb(v_sale),'returned_quantity',v_prior_qty),
    to_jsonb(v_return),trim(p_reason));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('return',to_jsonb(v_return)));
end;
$$;

create or replace function public.correct_sale(
  p_operation_id uuid,
  p_device_id uuid,
  p_correction_id uuid,
  p_replacement_sale_id uuid,
  p_original_sale_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_original public.sales;
  v_replacement public.sales;
  v_correction public.sale_corrections;
  v_original_session public.cash_sessions;
  v_applied_session public.cash_sessions;
  v_round public.rounds;
  v_cached jsonb;
  v_claim_payload jsonb;
  v_reason text:=trim(coalesce(p_payload->>'reason',''));
  v_qty integer:=(p_payload->>'quantity')::integer;
  v_unit bigint:=(p_payload->>'unit_price_cents')::bigint;
  v_total bigint:=(p_payload->>'total_cents')::bigint;
  v_paid bigint:=(p_payload->>'paid_cents')::bigint;
  v_credit bigint:=(p_payload->>'credit_cents')::bigint;
  v_method text:=p_payload->>'payment_method';
  v_channel text:=p_payload->>'channel';
  v_client uuid:=nullif(p_payload->>'client_id','')::uuid;
  v_round_id uuid:=nullif(p_payload->>'round_id','')::uuid;
  v_requested_cash uuid:=nullif(p_payload->>'cash_session_id','')::uuid;
  v_original_location uuid;
  v_new_location uuid;
  v_old_cash bigint;
  v_new_cash bigint;
  v_cash_delta bigint;
  v_post_close boolean:=false;
  v_replacement_cash uuid;
  v_cash_accounting text:='normal';
  v_balance bigint;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('correct_sale') then
    raise exception 'operation_not_authorized' using errcode='42501';
  end if;
  if v_reason='' then raise exception 'correction_reason_required' using errcode='22023'; end if;

  select * into v_original from public.sales where id=p_original_sale_id for update;
  if v_original.id is null then raise exception 'sale_not_found' using errcode='P0002'; end if;
  if v_actor.role<>'administrador' and v_original.user_id<>v_actor.id then
    raise exception 'sale_scope_violation' using errcode='42501';
  end if;
  if v_actor.role<>'administrador'
     and v_original.occurred_at < now()-interval '30 minutes'
     and not exists(select 1 from public.cash_sessions c where c.id=v_original.cash_session_id and c.status='open' and c.user_id=v_actor.id) then
    raise exception 'sale_change_window_expired' using errcode='42501';
  end if;

  v_claim_payload:=jsonb_build_object('correction_id',p_correction_id,'replacement_sale_id',p_replacement_sale_id,'original_sale_id',p_original_sale_id,'payload',p_payload);
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'correct_sale',v_claim_payload);
  if v_cached is not null then return v_cached; end if;

  if v_original.status<>'active' or exists(select 1 from public.sale_returns where sale_id=v_original.id) then
    raise exception 'sale_not_correctable' using errcode='55000';
  end if;
  if v_qty<=0 or v_unit<0 or v_total<>v_qty*v_unit or v_paid<0 or v_credit<0 or v_paid+v_credit<>v_total then
    raise exception 'invalid_sale_amounts' using errcode='23514';
  end if;
  if v_credit>0 and v_client is null then raise exception 'credit_requires_client' using errcode='23514'; end if;
  if v_method not in ('efectivo','transferencia','fiado','mixto') then raise exception 'invalid_payment_method' using errcode='22023'; end if;

  if v_actor.role='ventanilla' and v_channel not in ('ventanilla','fuera_ruta','fuera_horario') then raise exception 'channel_scope_violation' using errcode='42501'; end if;
  if v_actor.role='repartidor' and v_channel<>v_actor.route then raise exception 'route_scope_violation' using errcode='42501'; end if;
  if v_client is not null and not exists(
    select 1 from public.clients c where c.id=v_client and c.active and (
      v_actor.role in ('administrador','ventanilla') or c.created_by=v_actor.id or c.normal_route=v_actor.route
    )
  ) then raise exception 'client_scope_violation' using errcode='42501'; end if;

  if v_channel in ('ruta1','ruta2') then
    if v_round_id is null then raise exception 'active_round_required' using errcode='23514'; end if;
    select * into v_round from public.rounds where id=v_round_id for update;
    if v_round.id is null or v_round.route<>v_channel then raise exception 'invalid_round_scope' using errcode='42501'; end if;
    if v_round.status='closed' and not (v_actor.role='administrador' and v_round.id=v_original.round_id and v_channel=v_original.channel) then
      raise exception 'closed_round_correction_not_allowed' using errcode='42501';
    end if;
    if v_round.status<>'closed' and v_round.status not in ('preparing','active') then raise exception 'invalid_round_scope' using errcode='42501'; end if;
    if v_actor.role='repartidor' and v_round.user_id<>v_actor.id then raise exception 'route_scope_violation' using errcode='42501'; end if;
  elsif v_round_id is not null then
    raise exception 'round_not_allowed_for_channel' using errcode='23514';
  end if;

  if v_original.client_id is not null and v_original.credit_cents>0 then
    select coalesce(sum(amount_cents),0)::bigint into v_balance from public.ledger_entries where client_id=v_original.client_id;
    if v_balance<v_original.credit_cents then raise exception 'sale_credit_already_paid' using errcode='23514'; end if;
  end if;

  v_original_location:=app_private.sale_location_id(v_original.channel,v_original.round_id,true);
  v_new_location:=app_private.sale_location_id(v_channel,v_round_id,v_round.status='closed');
  perform 1 from public.inventory_locations where id in (v_original_location,v_new_location) order by id for update;
  if v_original_location=v_new_location then
    if (select quantity from public.inventory_locations where id=v_new_location)+v_original.quantity<v_qty then raise exception 'insufficient_inventory' using errcode='23514'; end if;
    update public.inventory_locations set quantity=quantity+v_original.quantity-v_qty,updated_at=now() where id=v_new_location;
  else
    if (select quantity from public.inventory_locations where id=v_new_location)<v_qty then raise exception 'insufficient_inventory' using errcode='23514'; end if;
    update public.inventory_locations set quantity=quantity+v_original.quantity,updated_at=now() where id=v_original_location;
    update public.inventory_locations set quantity=quantity-v_qty,updated_at=now() where id=v_new_location;
  end if;

  v_old_cash:=case when v_original.payment_method in ('efectivo','mixto') then v_original.paid_cents else 0 end;
  v_new_cash:=case when v_method in ('efectivo','mixto') then v_paid else 0 end;
  v_cash_delta:=v_new_cash-v_old_cash;
  if v_original.cash_session_id is not null then select * into v_original_session from public.cash_sessions where id=v_original.cash_session_id for update; end if;
  if v_cash_delta<>0 then
    if v_original_session.id is not null and v_original_session.status='open' then
      if v_original_session.user_id<>v_actor.id then raise exception 'cash_session_not_available' using errcode='42501'; end if;
      v_applied_session:=v_original_session;
    else
      if not app_private.can_operate('cash_adjustments') then raise exception 'post_close_adjustment_not_authorized' using errcode='42501'; end if;
      select * into v_applied_session from public.cash_sessions where id=v_requested_cash for update;
      if v_applied_session.id is null or v_applied_session.status<>'open' or v_applied_session.user_id<>v_actor.id then raise exception 'cash_session_required' using errcode='42501'; end if;
      v_post_close:=v_original_session.id is not null and v_original_session.status='closed';
    end if;
    if v_cash_delta<0 and app_private.cash_expected_cents(v_applied_session.id)<abs(v_cash_delta) then raise exception 'insufficient_cash' using errcode='23514'; end if;
  end if;
  if v_original_session.id is not null and v_original_session.status='closed' then
    v_replacement_cash:=null;
    v_cash_accounting:='adjustment_only';
  elsif v_new_cash>0 then
    v_replacement_cash:=coalesce(v_original_session.id,v_applied_session.id,v_requested_cash);
  else
    v_replacement_cash:=null;
  end if;

  update public.sales set status='corrected',synced_at=now() where id=v_original.id;
  insert into public.sales(
    id,folio,client_id,user_id,channel,route,round_id,cash_session_id,quantity,
    unit_price_cents,total_cents,paid_cents,credit_cents,payment_method,status,cash_accounting,
    original_sale_id,device_id,operation_id,notes,occurred_at
  ) values (
    p_replacement_sale_id,app_private.next_folio('sale'),v_client,v_actor.id,v_channel,
    case when v_channel in ('ruta1','ruta2') then v_channel else null end,v_round_id,
    v_replacement_cash,v_qty,v_unit,v_total,v_paid,v_credit,v_method,'active',v_cash_accounting,
    v_original.id,p_device_id,p_operation_id,coalesce(p_payload->>'notes',''),now()
  ) returning * into v_replacement;
  insert into public.sale_corrections(id,folio,original_sale_id,replacement_sale_id,correction_type,reason,created_by,device_id,operation_id)
  values(p_correction_id,app_private.next_folio('correction'),v_original.id,v_replacement.id,'correct',v_reason,v_actor.id,p_device_id,p_operation_id)
  returning * into v_correction;

  insert into public.inventory_movements(container_type,to_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id)
  values('full',v_original_location,v_original.quantity,'sale_correction_restore','sale_correction',v_correction.id,v_original.round_id,v_actor.id,p_operation_id);
  insert into public.inventory_movements(container_type,from_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id)
  values('full',v_new_location,v_qty,'sale_correction_replacement','sale_correction',v_correction.id,v_round_id,v_actor.id,p_operation_id);

  if v_original.credit_cents>0 then
    insert into public.ledger_entries(client_id,entry_type,amount_cents,sale_id,reason,created_by,operation_id)
    values(v_original.client_id,'reversal',-v_original.credit_cents,v_original.id,'Corrección: '||v_reason,v_actor.id,p_operation_id);
  end if;
  if v_credit>0 then
    insert into public.ledger_entries(client_id,entry_type,amount_cents,sale_id,reason,created_by,operation_id)
    values(v_client,'charge',v_credit,v_replacement.id,'Venta corregida',v_actor.id,p_operation_id);
  end if;
  if v_cash_delta<>0 then
    insert into public.cash_movements(cash_session_id,movement_type,direction,amount_cents,reference_type,reference_id,user_id,operation_id)
    values(v_applied_session.id,case when v_post_close then 'post_close_adjustment' else 'adjustment' end,
      case when v_cash_delta>0 then 'in' else 'out' end,abs(v_cash_delta),'sale_correction',v_correction.id,v_actor.id,p_operation_id);
    insert into public.sale_cash_adjustments(sale_id,correction_id,original_cash_session_id,applied_cash_session_id,amount_cents,post_close,reason,user_id,device_id,operation_id)
    values(v_original.id,v_correction.id,v_original_session.id,v_applied_session.id,v_cash_delta,v_post_close,v_reason,v_actor.id,p_device_id,p_operation_id);
  end if;

  insert into public.audit_log(user_id,device_id,action,entity,entity_id,before_data,after_data,reason)
  values(v_actor.id,p_device_id,'sale_corrected','sale',v_original.id,to_jsonb(v_original),jsonb_build_object('original_status','corrected','replacement',to_jsonb(v_replacement),'correction',to_jsonb(v_correction)),v_reason);
  if v_post_close then
    insert into public.audit_log(user_id,device_id,action,entity,entity_id,before_data,after_data,reason)
    values(v_actor.id,p_device_id,'post_close_adjustment','cash_session',v_original_session.id,to_jsonb(v_original_session),jsonb_build_object('applied_cash_session_id',v_applied_session.id,'amount_cents',v_cash_delta),v_reason);
  end if;
  return app_private.complete_operation(p_operation_id,jsonb_build_object('original_sale_id',v_original.id,'replacement',to_jsonb(v_replacement),'correction',to_jsonb(v_correction)));
end;
$$;

create or replace function public.void_sale(
  p_operation_id uuid,
  p_device_id uuid,
  p_correction_id uuid,
  p_sale_id uuid,
  p_cash_session_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_sale public.sales;
  v_correction public.sale_corrections;
  v_original_session public.cash_sessions;
  v_applied_session public.cash_sessions;
  v_cached jsonb;
  v_payload jsonb;
  v_return_qty integer;
  v_return_refund bigint;
  v_return_credit bigint;
  v_remaining_qty integer;
  v_remaining_cash bigint;
  v_remaining_credit bigint;
  v_location_id uuid;
  v_post_close boolean:=false;
  v_balance bigint;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('void_sale') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'void_reason_required' using errcode='22023'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale.id is null then raise exception 'sale_not_found' using errcode='P0002'; end if;
  if v_actor.role<>'administrador' and v_sale.user_id<>v_actor.id then raise exception 'sale_scope_violation' using errcode='42501'; end if;
  if v_actor.role<>'administrador' and v_sale.occurred_at<now()-interval '30 minutes'
     and not exists(select 1 from public.cash_sessions c where c.id=v_sale.cash_session_id and c.status='open' and c.user_id=v_actor.id) then
    raise exception 'sale_change_window_expired' using errcode='42501';
  end if;
  v_payload:=jsonb_build_object('correction_id',p_correction_id,'sale_id',p_sale_id,'cash_session_id',p_cash_session_id,'reason',trim(p_reason));
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'void_sale',v_payload);
  if v_cached is not null then return v_cached; end if;
  if v_sale.status<>'active' then raise exception 'sale_not_voidable' using errcode='55000'; end if;

  select coalesce(sum(quantity),0)::integer,coalesce(sum(refund_cents),0)::bigint,coalesce(sum(credit_reversal_cents),0)::bigint
    into v_return_qty,v_return_refund,v_return_credit from public.sale_returns where sale_id=v_sale.id;
  v_remaining_qty:=v_sale.quantity-v_return_qty;
  v_remaining_cash:=case when v_sale.payment_method in ('efectivo','mixto') then v_sale.paid_cents-v_return_refund else 0 end;
  v_remaining_credit:=v_sale.credit_cents-v_return_credit;
  if v_remaining_credit>0 and v_sale.client_id is not null then
    select coalesce(sum(amount_cents),0)::bigint into v_balance from public.ledger_entries where client_id=v_sale.client_id;
    if v_balance<v_remaining_credit then raise exception 'sale_credit_already_paid' using errcode='23514'; end if;
  end if;

  if v_remaining_cash>0 then
    if v_sale.cash_session_id is not null then select * into v_original_session from public.cash_sessions where id=v_sale.cash_session_id for update; end if;
    if v_original_session.id is not null and v_original_session.status='open' then
      if v_original_session.user_id<>v_actor.id then raise exception 'cash_session_not_available' using errcode='42501'; end if;
      v_applied_session:=v_original_session;
    else
      if not app_private.can_operate('cash_adjustments') then raise exception 'post_close_adjustment_not_authorized' using errcode='42501'; end if;
      select * into v_applied_session from public.cash_sessions where id=p_cash_session_id for update;
      if v_applied_session.id is null or v_applied_session.status<>'open' or v_applied_session.user_id<>v_actor.id then raise exception 'cash_session_required' using errcode='42501'; end if;
      v_post_close:=v_original_session.id is not null and v_original_session.status='closed';
    end if;
    if app_private.cash_expected_cents(v_applied_session.id)<v_remaining_cash then raise exception 'insufficient_cash' using errcode='23514'; end if;
  end if;

  v_location_id:=app_private.sale_location_id(v_sale.channel,v_sale.round_id,true);
  if v_remaining_qty>0 then
    perform 1 from public.inventory_locations where id=v_location_id for update;
    update public.inventory_locations set quantity=quantity+v_remaining_qty,updated_at=now() where id=v_location_id;
  end if;
  update public.sales set status='voided',synced_at=now() where id=v_sale.id;
  insert into public.sale_corrections(id,folio,original_sale_id,replacement_sale_id,correction_type,reason,created_by,device_id,operation_id)
  values(p_correction_id,app_private.next_folio('correction'),v_sale.id,null,'void',trim(p_reason),v_actor.id,p_device_id,p_operation_id)
  returning * into v_correction;
  if v_remaining_qty>0 then
    insert into public.inventory_movements(container_type,to_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id)
    values('full',v_location_id,v_remaining_qty,'sale_void_restore','sale_correction',v_correction.id,v_sale.round_id,v_actor.id,p_operation_id);
  end if;
  if v_remaining_credit>0 then
    insert into public.ledger_entries(client_id,entry_type,amount_cents,sale_id,reason,created_by,operation_id)
    values(v_sale.client_id,'reversal',-v_remaining_credit,v_sale.id,'Anulación: '||trim(p_reason),v_actor.id,p_operation_id);
  end if;
  if v_remaining_cash>0 then
    insert into public.cash_movements(cash_session_id,movement_type,direction,amount_cents,reference_type,reference_id,user_id,operation_id)
    values(v_applied_session.id,case when v_post_close then 'post_close_adjustment' else 'adjustment' end,'out',v_remaining_cash,'sale_void',v_correction.id,v_actor.id,p_operation_id);
    insert into public.sale_cash_adjustments(sale_id,correction_id,original_cash_session_id,applied_cash_session_id,amount_cents,post_close,reason,user_id,device_id,operation_id)
    values(v_sale.id,v_correction.id,v_original_session.id,v_applied_session.id,-v_remaining_cash,v_post_close,trim(p_reason),v_actor.id,p_device_id,p_operation_id);
  end if;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,before_data,after_data,reason)
  values(v_actor.id,p_device_id,'sale_voided','sale',v_sale.id,to_jsonb(v_sale),jsonb_build_object('status','voided','correction',to_jsonb(v_correction),'remaining_quantity',v_remaining_qty),trim(p_reason));
  if v_post_close then
    insert into public.audit_log(user_id,device_id,action,entity,entity_id,before_data,after_data,reason)
    values(v_actor.id,p_device_id,'post_close_adjustment','cash_session',v_original_session.id,to_jsonb(v_original_session),jsonb_build_object('applied_cash_session_id',v_applied_session.id,'amount_cents',-v_remaining_cash),trim(p_reason));
  end if;
  return app_private.complete_operation(p_operation_id,jsonb_build_object('sale_id',v_sale.id,'status','voided','correction',to_jsonb(v_correction)));
end;
$$;

-- Round closure uses active, net units. Corrected and voided originals are not
-- counted; partial returns reduce the active sale quantity.
create or replace function public.close_round(
  p_operation_id uuid, p_device_id uuid, p_round_id uuid,
  p_returned_full integer, p_returned_empty integer, p_damaged integer, p_lost integer,
  p_notes text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor public.profiles; v_round public.rounds; v_route public.inventory_locations; v_local public.inventory_locations; v_wash public.inventory_locations; v_damaged_loc public.inventory_locations; v_sold integer; v_expected integer; v_cached jsonb; v_payload jsonb;
begin
  select * into v_actor from public.profiles where id=app_private.current_profile_id();
  if v_actor.id is null or not app_private.can_operate('rounds') then raise exception 'operation_not_authorized' using errcode='42501'; end if;
  if least(p_returned_full,p_returned_empty,p_damaged,p_lost)<0 then raise exception 'invalid_round_return' using errcode='22023'; end if;
  v_payload:=jsonb_build_object('round_id',p_round_id,'returned_full',p_returned_full,'returned_empty',p_returned_empty,'damaged',p_damaged,'lost',p_lost,'notes',coalesce(p_notes,''));
  v_cached:=app_private.claim_operation(p_operation_id,p_device_id,'close_round',v_payload);
  if v_cached is not null then return v_cached; end if;
  select * into v_round from public.rounds where id=p_round_id for update;
  if v_round.id is null or v_round.status='closed' then raise exception 'round_not_open' using errcode='55000'; end if;
  if v_actor.role='repartidor' and (v_round.user_id<>v_actor.id or v_round.route<>v_actor.route) then raise exception 'route_scope_violation' using errcode='42501'; end if;
  select coalesce(sum(s.quantity-coalesce(r.returned_quantity,0)),0)::integer into v_sold
  from public.sales s
  left join lateral (select sum(sr.quantity)::integer returned_quantity from public.sale_returns sr where sr.sale_id=s.id) r on true
  where s.round_id=v_round.id and s.status='active';
  v_expected:=v_round.loaded_full_qty-v_sold;
  if p_returned_full+p_damaged+p_lost<>v_expected then raise exception 'round_return_mismatch' using errcode='23514'; end if;
  select * into v_route from public.inventory_locations where id=app_private.inventory_location_id(v_round.route) for update;
  select * into v_local from public.inventory_locations where id=app_private.inventory_location_id('local') for update;
  select * into v_wash from public.inventory_locations where id=app_private.inventory_location_id('lavado') for update;
  select * into v_damaged_loc from public.inventory_locations where id=app_private.inventory_location_id('danados') for update;
  if v_route.quantity<p_returned_full+p_damaged+p_lost then raise exception 'insufficient_route_inventory' using errcode='23514'; end if;
  update public.inventory_locations set quantity=quantity-(p_returned_full+p_damaged+p_lost),updated_at=now() where id=v_route.id;
  update public.inventory_locations set quantity=quantity+p_returned_full,updated_at=now() where id=v_local.id;
  update public.inventory_locations set quantity=quantity+p_returned_empty,updated_at=now() where id=v_wash.id;
  update public.inventory_locations set quantity=quantity+p_damaged,updated_at=now() where id=v_damaged_loc.id;
  if p_returned_full>0 then insert into public.inventory_movements(container_type,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id) values('full',v_route.id,v_local.id,p_returned_full,'round_return_full','round',v_round.id,v_round.id,v_actor.id,p_operation_id); end if;
  if p_damaged>0 then
    insert into public.inventory_movements(container_type,from_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id) values('full',v_route.id,p_damaged,'round_damaged_out','round',v_round.id,v_round.id,v_actor.id,p_operation_id);
    insert into public.inventory_movements(container_type,to_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id) values('damaged',v_damaged_loc.id,p_damaged,'round_damaged_in','round',v_round.id,v_round.id,v_actor.id,p_operation_id);
  end if;
  if p_lost>0 then insert into public.inventory_movements(container_type,from_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id) values('full',v_route.id,p_lost,'round_lost','round',v_round.id,v_round.id,v_actor.id,p_operation_id); end if;
  if p_returned_empty>0 then insert into public.inventory_movements(container_type,to_location_id,quantity,movement_type,reference_type,reference_id,round_id,user_id,operation_id) values('empty',v_wash.id,p_returned_empty,'empty_returned','round',v_round.id,v_round.id,v_actor.id,p_operation_id); end if;
  update public.rounds set returned_at=now(),closed_at=now(),returned_full_qty=p_returned_full,returned_empty_qty=p_returned_empty,damaged_qty=p_damaged,lost_qty=p_lost,status='closed',close_operation_id=p_operation_id where id=v_round.id returning * into v_round;
  insert into public.audit_log(user_id,device_id,action,entity,entity_id,after_data,reason) values(v_actor.id,p_device_id,'round_closed','round',v_round.id,to_jsonb(v_round),coalesce(p_notes,''));
  return app_private.complete_operation(p_operation_id,jsonb_build_object('round',to_jsonb(v_round),'net_sold_quantity',v_sold));
end;
$$;

revoke execute on function public.return_sale(uuid,uuid,uuid,uuid,integer,uuid,text) from public,anon;
revoke execute on function public.correct_sale(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon;
revoke execute on function public.void_sale(uuid,uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.return_sale(uuid,uuid,uuid,uuid,integer,uuid,text) to authenticated;
grant execute on function public.correct_sale(uuid,uuid,uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.void_sale(uuid,uuid,uuid,uuid,uuid,text) to authenticated;
