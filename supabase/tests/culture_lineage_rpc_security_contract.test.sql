-- Contract test for the tenant-scoped recursive culture lineage read RPC.
\set ON_ERROR_STOP on

do $$
declare
  v_signature regprocedure;
  v_proc record;
  v_search_path text;
begin
  v_signature := to_regprocedure(
    'public.get_culture_lineage(uuid,uuid)'
  );
  if v_signature is null then
    raise exception 'FAIL: recursive culture lineage RPC is missing';
  end if;

  select p.prosecdef, p.proconfig, p.proacl, p.proowner
    into v_proc
    from pg_proc p
   where p.oid = v_signature;

  if not v_proc.prosecdef then
    raise exception 'FAIL: lineage RPC must be SECURITY DEFINER';
  end if;

  select setting into v_search_path
    from unnest(coalesce(v_proc.proconfig, array[]::text[])) as settings(setting)
   where setting like 'search_path=%'
   limit 1;
  if v_search_path is distinct from 'search_path=pg_catalog' then
    raise exception 'FAIL: lineage RPC search_path must be pg_catalog: %', v_search_path;
  end if;

  if not has_function_privilege('authenticated', v_signature, 'EXECUTE')
     or has_function_privilege('anon', v_signature, 'EXECUTE')
     or has_function_privilege('PUBLIC', v_signature, 'EXECUTE') then
    raise exception 'FAIL: lineage RPC execute grants are incorrect';
  end if;
end
$$;

select 'culture lineage RPC security contract passed' as result;
