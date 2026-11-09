-- Security contract for the generation comparison read RPC.
\set ON_ERROR_STOP on

do $$
declare
  v_signature regprocedure;
  v_proc record;
  v_search_path text;
begin
  v_signature := to_regprocedure('public.compare_culture_generations(uuid,uuid[])');
  if v_signature is null then
    raise exception 'FAIL: culture generation comparison RPC is missing';
  end if;

  select p.prosecdef, p.proconfig, p.proacl, p.proowner
    into v_proc
    from pg_proc p
   where p.oid = v_signature;

  if not v_proc.prosecdef then
    raise exception 'FAIL: generation comparison RPC must be SECURITY DEFINER';
  end if;

  select setting into v_search_path
    from unnest(coalesce(v_proc.proconfig, array[]::text[])) as settings(setting)
   where setting like 'search_path=%'
   limit 1;
  if v_search_path is distinct from 'search_path=pg_catalog' then
    raise exception 'FAIL: generation comparison RPC search_path must be pg_catalog: %', v_search_path;
  end if;

  if not has_function_privilege('authenticated', v_signature, 'EXECUTE')
     or has_function_privilege('anon', v_signature, 'EXECUTE')
     or exists (
       select 1
         from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
     ) then
    raise exception 'FAIL: generation comparison RPC execute grants are incorrect';
  end if;
end
$$;

select 'culture generation comparison RPC security contract passed' as result;
