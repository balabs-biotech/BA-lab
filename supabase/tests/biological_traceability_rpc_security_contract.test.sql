-- Regression contract: biological traceability remains writable through its
-- organization-checked RPC after direct audit-table writes are revoked.
\set ON_ERROR_STOP on

do $$
declare
  v_signature regprocedure := 'public.record_biological_operation(uuid,uuid,text,timestamp with time zone,text,jsonb,text[])'::regprocedure;
  v_proc record;
  v_search_path text;
begin
  select p.prosecdef, p.proconfig, p.proacl, p.proowner
    into v_proc
    from pg_proc p
   where p.oid = v_signature;

  if not found then
    raise exception 'FAIL: biological traceability RPC does not exist';
  end if;
  if not v_proc.prosecdef then
    raise exception 'FAIL: biological traceability RPC must be SECURITY DEFINER after audit writes are revoked';
  end if;

  select setting into v_search_path
    from unnest(coalesce(v_proc.proconfig, array[]::text[])) as settings(setting)
   where setting like 'search_path=%'
   limit 1;
  if v_search_path is distinct from 'search_path=pg_catalog' then
    raise exception 'FAIL: biological traceability RPC must pin search_path to pg_catalog: %', v_search_path;
  end if;

  if not has_function_privilege('authenticated', v_signature, 'EXECUTE') then
    raise exception 'FAIL: authenticated cannot execute biological traceability RPC';
  end if;
  if has_function_privilege('anon', v_signature, 'EXECUTE') then
    raise exception 'FAIL: anon can execute biological traceability RPC';
  end if;
  if exists (
    select 1 from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
     where a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'FAIL: PUBLIC can execute biological traceability RPC';
  end if;
end
$$;

select 'biological traceability RPC privilege contract passed' as result;
