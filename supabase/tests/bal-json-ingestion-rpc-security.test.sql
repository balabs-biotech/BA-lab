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
  if v_definition not ilike '%on conflict (organization_id, record_id) do nothing%' or
     v_definition not ilike '%for update%' or
     v_definition not ilike '%v_existing.event_id is null%' or
     v_definition not ilike '%status'',''duplicate%' or
     v_definition not ilike '%set event_id = v_event_id%' then
    raise exception 'FAIL: duplicate retries must lock and return the original committed event receipt';
  end if;
  if position('set search_path to ' || chr(39) || chr(39) in lower(v_definition)) = 0 then
    raise exception 'FAIL: BAL-JSON SECURITY DEFINER RPC must use an empty search_path';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = v_receipt
       and contype = 'p'
       and pg_get_constraintdef(oid) ilike '%organization_id, record_id%'
  ) then
    raise exception 'FAIL: receipt identity must be unique per organization and record ID';
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
  if has_table_privilege('authenticated', v_receipt, 'UPDATE') or
     has_table_privilege('authenticated', v_receipt, 'DELETE') or
     has_table_privilege('authenticated', v_receipt, 'TRUNCATE') or
     has_table_privilege('anon', v_receipt, 'INSERT') or
     has_table_privilege('anon', v_receipt, 'UPDATE') or
     has_table_privilege('anon', v_receipt, 'DELETE') then
    raise exception 'FAIL: receipt table must deny all direct client mutations';
  end if;

  if to_regprocedure('private.resolve_bal_json_domain(uuid,uuid,uuid,uuid)') is null then
    raise exception 'FAIL: BAL-JSON must resolve the persisted workspace domain from its biological anchor';
  end if;
  if to_regprocedure('private.is_bal_json_variable_allowed(text,text)') is null then
    raise exception 'FAIL: BAL-JSON must enforce workspace-specific variable allowlists server-side';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.cultures'::regclass
       and tgname = 'cultures_domain_immutable'
       and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.materials'::regclass
       and tgname = 'materials_domain_immutable'
       and not tgisinternal
  ) then
    raise exception 'FAIL: persisted biological domain metadata must be immutable after creation';
  end if;

  if has_table_privilege('authenticated', v_receipt, 'SELECT') or
     has_table_privilege('authenticated', v_receipt, 'INSERT') or
     has_table_privilege('anon', v_receipt, 'SELECT') then
    raise exception 'FAIL: receipt table must not be directly accessible to client roles';
  end if;
end
$$;

select 'BAL-JSON ingestion idempotency and privilege contract passed' as result;
