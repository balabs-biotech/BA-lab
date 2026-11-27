-- Contract test for the BAL-JSON idempotent ingestion boundary after migration replay.
\set ON_ERROR_STOP on

do $$
declare
  v_proc regprocedure := 'public.ingest_bal_json_record(uuid,text,text,jsonb,jsonb)'::regprocedure;
  v_definition text;
  v_receipt regclass := to_regclass('private.bal_json_ingestion_receipts');
begin
  if v_receipt is null then
    raise exception 'FAIL: private BAL-JSON receipt table is missing';
  end if;

  select pg_get_functiondef(v_proc) into v_definition;
  if v_definition not ilike '%private.is_org_member(v_org_id)%' then
    raise exception 'FAIL: BAL-JSON RPC does not enforce organization membership';
  end if;
  if v_definition not ilike '%payload_sha256%' or
     v_definition not ilike '%bal_json_record_id_payload_mismatch%' then
    raise exception 'FAIL: BAL-JSON RPC does not bind record IDs to payload hashes';
  end if;
  if v_definition not ilike '%record_manual_measurement%' or
     v_definition not ilike '%record_manual_observation%' then
    raise exception 'FAIL: BAL-JSON RPC does not reuse atomic domain write functions';
  end if;

  if v_definition not ilike '%resolve_bal_json_domain%' or
     v_definition not ilike '%is_bal_json_variable_allowed%' then
    raise exception 'FAIL: direct BAL-JSON RPC calls must enforce biological domain and variable policy';
  end if;
  if not (select prosecdef from pg_proc where oid = v_proc) then
    raise exception 'FAIL: BAL-JSON RPC must be SECURITY DEFINER to write the private receipt table';
  end if;
  if has_function_privilege('anon', v_proc, 'EXECUTE') then
    raise exception 'FAIL: anonymous/public roles must not execute BAL-JSON ingestion';
  end if;
  if not has_function_privilege('authenticated', v_proc, 'EXECUTE') then
    raise exception 'FAIL: authenticated role must be able to execute BAL-JSON ingestion';
  end if;

  if to_regprocedure('public.resolve_bal_json_domain(uuid,uuid,uuid,uuid)') is null then
    raise exception 'FAIL: BAL-JSON must resolve the persisted workspace domain from its biological anchor';
  end if;
  if to_regprocedure('public.is_bal_json_variable_allowed(text,text)') is null then
    raise exception 'FAIL: BAL-JSON must enforce workspace-specific variable allowlists server-side';
  end if;

  if not exists (select 1 from pg_trigger where tgrelid = 'public.cultures'::regclass and tgname = 'cultures_domain_immutable' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.materials'::regclass and tgname = 'materials_domain_immutable' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.plant_cultures'::regclass and tgname = 'plant_cultures_domain_immutable' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.cultures'::regclass and tgname = 'cultures_domain_insert_guard' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.materials'::regclass and tgname = 'materials_domain_insert_guard' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid = 'public.plant_cultures'::regclass and tgname = 'plant_cultures_domain_insert_guard' and not tgisinternal) then
    raise exception 'FAIL: biological domain metadata must be validated on insert and protected against later rewrites';
  end if;

  if public.is_bal_json_variable_allowed('mycology', 'cfu') is not true
     or public.is_bal_json_variable_allowed('mycology', 'root_length') is not false
     or public.is_bal_json_variable_allowed('agronomy', 'root_length') is not true
     or public.is_bal_json_variable_allowed('agronomy', 'cfu') is not false
     or public.is_bal_json_variable_allowed('laboratory', 'temperature') is not true then
    raise exception 'FAIL: BAL-JSON workspace variable allowlists do not match the workspace contract';
  end if;

  if has_table_privilege('authenticated', v_receipt, 'SELECT') or
     has_table_privilege('authenticated', v_receipt, 'INSERT') or
     has_table_privilege('anon', v_receipt, 'SELECT') then
    raise exception 'FAIL: receipt table must not be directly accessible to client roles';
  end if;
end
$$;

select 'BAL-JSON ingestion idempotency and privilege contract passed' as result;
