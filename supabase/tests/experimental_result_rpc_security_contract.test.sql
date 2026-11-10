-- Verify the experimental-result write RPC after a full migration replay.
do $$
declare
  v_signature regprocedure :=
    'public.record_experiment_result(uuid,uuid,text,text,jsonb,text,uuid,timestamp with time zone)'::regprocedure;
  v_proc record;
  v_definition text;
begin
  select p.prosecdef, p.proconfig, p.proacl, p.proowner,
         pg_get_functiondef(p.oid) as definition
    into v_proc
    from pg_proc p
   where p.oid = v_signature;

  if not v_proc.prosecdef then
    raise exception 'FAIL: experimental-result RPC must be SECURITY DEFINER';
  end if;
  if not ('search_path=pg_catalog' = any(coalesce(v_proc.proconfig,array[]::text[]))) then
    raise exception 'FAIL: experimental-result RPC must pin search_path to pg_catalog';
  end if;
  if not has_function_privilege('authenticated',v_signature,'EXECUTE')
     or has_function_privilege('anon',v_signature,'EXECUTE')
     or exists (
       select 1 from aclexplode(coalesce(v_proc.proacl,acldefault('f',v_proc.proowner))) acl
        where acl.grantee=0 and acl.privilege_type='EXECUTE'
     ) then
    raise exception 'FAIL: experimental-result RPC grants are not least-privilege';
  end if;
  v_definition := lower(v_proc.definition);
  if position('private.is_org_writer' in v_definition)=0
     or position('private.operation_idempotency_receipts' in v_definition)=0
     or position('idempotency_key_reused_with_different_payload' in v_definition)=0
     or position('experiment_result_recorded' in v_definition)=0
     or position('experimental_unit_not_found' in v_definition)=0
     or position('experimental_result_value_must_be_json_object' in v_definition)=0 then
    raise exception 'FAIL: experimental-result RPC is missing authorization, receipt, traceability or payload-validation contract';
  end if;
  if has_table_privilege('authenticated','public.results','INSERT')
     or has_table_privilege('authenticated','public.results','UPDATE')
     or has_table_privilege('authenticated','public.results','DELETE')
     or has_table_privilege('anon','public.results','INSERT')
     or has_table_privilege('anon','public.results','UPDATE')
     or has_table_privilege('anon','public.results','DELETE') then
    raise exception 'FAIL: clients can bypass the validated experimental-result RPC';
  end if;
end
$$;
select 'PASS: experimental-result RPC security, idempotency and append-only result writes' as test_result;
