do $$
declare
  v_signature regprocedure :=
    'public.create_culture_with_generation_idempotent(uuid,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,timestamp with time zone,jsonb)'::regprocedure;
  v_old_signature regprocedure :=
    'public.create_culture_with_generation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,timestamp with time zone,jsonb)'::regprocedure;
  v_proc record;
  v_old_proc record;
  v_definition text;
begin
  select p.prosecdef, p.proconfig, p.proacl, p.proowner, pg_get_functiondef(p.oid) as definition
    into v_proc
    from pg_proc p
   where p.oid = v_signature;

  if not v_proc.prosecdef then
    raise exception 'FAIL: idempotent culture-generation RPC must be SECURITY DEFINER';
  end if;
  if not ('search_path=pg_catalog' = any(coalesce(v_proc.proconfig, array[]::text[]))) then
    raise exception 'FAIL: idempotent culture-generation RPC must pin search_path to pg_catalog';
  end if;
  if not has_function_privilege('authenticated', v_signature, 'EXECUTE')
     or has_function_privilege('anon', v_signature, 'EXECUTE')
     or exists (
       select 1
         from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception 'FAIL: idempotent culture-generation RPC grants are not least-privilege';
  end if;
  if has_function_privilege('authenticated', v_old_signature, 'EXECUTE') then
    raise exception 'FAIL: authenticated clients can bypass the idempotent culture-generation RPC';
  end if;
  select p.prosecdef, p.proconfig into v_old_proc
    from pg_proc p where p.oid = v_old_signature;
  if not v_old_proc.prosecdef
     or not ('search_path=pg_catalog' = any(coalesce(v_old_proc.proconfig, array[]::text[]))) then
    raise exception 'FAIL: internal culture-generation write primitive must be SECURITY DEFINER with a pinned search_path';
  end if;

  v_definition := lower(v_proc.definition);
  if position('private.is_org_writer' in v_definition) = 0
     or position('culture_data_consents' in v_definition) = 0
     or position('private.operation_idempotency_receipts' in v_definition) = 0
     or position('idempotency_key_reused_with_different_payload' in v_definition) = 0
     or position('public.create_culture_with_generation(' in v_definition) = 0 then
    raise exception 'FAIL: idempotent culture-generation RPC is missing an authorization, consent, receipt, conflict or atomic-write contract';
  end if;
end
$$;
select 'PASS: idempotent culture-generation RPC security, consent and receipt contract' as test_result;
