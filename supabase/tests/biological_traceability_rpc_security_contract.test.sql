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


do $block$
declare
  v_signature regprocedure := 'public.record_biological_operation(uuid,uuid,text,uuid,timestamp with time zone,text,jsonb,text[])'::regprocedure;
  v_proc record;
  v_search_path text;
begin
  select p.prosecdef, p.proconfig, p.proacl, p.proowner
    into v_proc
    from pg_proc p
   where p.oid = v_signature;
  if not found then
    raise exception 'FAIL: idempotent biological operation RPC does not exist';
  end if;
  if not v_proc.prosecdef then
    raise exception 'FAIL: idempotent biological operation RPC must be SECURITY DEFINER';
  end if;
  select setting into v_search_path
    from unnest(coalesce(v_proc.proconfig, array[]::text[])) as settings(setting)
   where setting like 'search_path=%'
   limit 1;
  if v_search_path is distinct from 'search_path=pg_catalog' then
    raise exception 'FAIL: idempotent RPC search_path must be pg_catalog: %', v_search_path;
  end if;
  if not has_function_privilege('authenticated', v_signature, 'EXECUTE')
     or has_function_privilege('anon', v_signature, 'EXECUTE') then
    raise exception 'FAIL: idempotent RPC execute grants are incorrect';
  end if;
  if has_table_privilege('authenticated', 'private.operation_idempotency_receipts', 'SELECT')
     or has_table_privilege('authenticated', 'private.operation_idempotency_receipts', 'INSERT')
     or has_table_privilege('anon', 'private.operation_idempotency_receipts', 'SELECT') then
    raise exception 'FAIL: clients must not access idempotency receipts directly';
  end if;
  if not (select relrowsecurity from pg_class where oid='private.operation_idempotency_receipts'::regclass) then
    raise exception 'FAIL: idempotency receipt table must have RLS enabled';
  end if;
end
$block$;

do $legacy$
begin
  if has_function_privilege(
    'authenticated',
    'public.record_biological_operation(uuid,uuid,text,timestamp with time zone,text,jsonb,text[])'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'FAIL: legacy non-idempotent biological RPC overload remains executable';
  end if;
end
$legacy$;

select 'biological traceability RPC privilege contract passed' as result;
