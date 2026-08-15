-- Merge duplicate clients without losing sales, payments, ledger history, or audit data.

create or replace function app_private.normalized_client_name(p_name text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select regexp_replace(lower(trim(coalesce(p_name, ''))), '[^[:alnum:]]+', '', 'g')
$$;

revoke all on function app_private.normalized_client_name(text)
from public, anon, authenticated;

create or replace function app_private.prevent_duplicate_client()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text := app_private.normalized_client_name(new.name);
  v_phone text := regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g');
begin
  if not new.active then return new; end if;
  if tg_op = 'UPDATE'
     and new.name is not distinct from old.name
     and new.phone is not distinct from old.phone
     and new.active is not distinct from old.active then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('client-name:' || v_name, 0));

  if v_name <> '' and exists (
    select 1
    from public.clients c
    where c.id <> new.id
      and c.active
      and app_private.normalized_client_name(c.name) = v_name
  ) then
    raise exception 'duplicate_client_name' using errcode = '23505';
  end if;

  if length(v_phone) >= 7 and exists (
    select 1
    from public.clients c
    where c.id <> new.id
      and c.active
      and c.phone_normalized = v_phone
  ) then
    raise exception 'duplicate_client_phone' using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function app_private.prevent_duplicate_client()
from public, anon, authenticated;

drop trigger if exists clients_prevent_duplicate on public.clients;
create trigger clients_prevent_duplicate
before insert or update of name, phone, active on public.clients
for each row execute function app_private.prevent_duplicate_client();

create or replace function public.merge_clients(
  p_operation_id uuid,
  p_device_id uuid,
  p_primary_client_id uuid,
  p_duplicate_client_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.profiles;
  v_primary public.clients;
  v_duplicates uuid[];
  v_payload jsonb;
  v_cached jsonb;
  v_expected integer;
  v_sales integer := 0;
  v_payments integer := 0;
  v_ledger integer := 0;
begin
  select * into v_actor
  from public.profiles
  where id = app_private.current_profile_id();

  if v_actor.id is null or v_actor.role <> 'administrador' or not v_actor.active then
    raise exception 'operation_not_authorized' using errcode = '42501';
  end if;

  select array_agg(distinct duplicate_id order by duplicate_id)
  into v_duplicates
  from unnest(coalesce(p_duplicate_client_ids, array[]::uuid[])) duplicate_id
  where duplicate_id is not null and duplicate_id <> p_primary_client_id;

  if p_primary_client_id is null
     or coalesce(cardinality(v_duplicates), 0) = 0
     or cardinality(v_duplicates) > 50 then
    raise exception 'invalid_client_merge' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object(
    'primary_client_id', p_primary_client_id,
    'duplicate_client_ids', to_jsonb(v_duplicates)
  );
  v_cached := app_private.claim_operation(
    p_operation_id, p_device_id, 'merge_clients', v_payload
  );
  if v_cached is not null then return v_cached; end if;

  select * into v_primary
  from public.clients
  where id = p_primary_client_id and active
  for update;
  if v_primary.id is null then
    raise exception 'client_not_found' using errcode = 'P0002';
  end if;

  perform 1
  from public.clients
  where id = any(v_duplicates)
  order by id
  for update;

  select count(*) into v_expected
  from public.clients
  where id = any(v_duplicates) and active;
  if v_expected <> cardinality(v_duplicates) then
    raise exception 'invalid_client_merge' using errcode = '22023';
  end if;

  insert into public.audit_log(
    user_id, device_id, action, entity, entity_id, before_data, after_data, reason
  )
  select
    v_actor.id,
    p_device_id,
    'client_merged',
    'client',
    c.id,
    to_jsonb(c),
    jsonb_build_object('merged_into', p_primary_client_id),
    'Cliente duplicado unido sin eliminar historial'
  from public.clients c
  where c.id = any(v_duplicates);

  update public.sales
  set client_id = p_primary_client_id
  where client_id = any(v_duplicates);
  get diagnostics v_sales = row_count;

  update public.payments
  set client_id = p_primary_client_id
  where client_id = any(v_duplicates);
  get diagnostics v_payments = row_count;

  update public.ledger_entries
  set client_id = p_primary_client_id
  where client_id = any(v_duplicates);
  get diagnostics v_ledger = row_count;

  update public.clients
  set active = false,
      possible_duplicate = false,
      notes = concat_ws(E'\n', nullif(notes, ''), 'Fusionado con ' || p_primary_client_id::text),
      version = version + 1,
      updated_at = now()
  where id = any(v_duplicates);

  update public.clients
  set possible_duplicate = false,
      version = version + 1,
      updated_at = now()
  where id = p_primary_client_id;

  return app_private.complete_operation(
    p_operation_id,
    jsonb_build_object(
      'primary_client_id', p_primary_client_id,
      'merged_client_ids', to_jsonb(v_duplicates),
      'sales_reassigned', v_sales,
      'payments_reassigned', v_payments,
      'ledger_entries_reassigned', v_ledger
    )
  );
end;
$$;

revoke execute on function public.merge_clients(uuid,uuid,uuid,uuid[])
from public, anon, authenticated;
grant execute on function public.merge_clients(uuid,uuid,uuid,uuid[])
to authenticated;
