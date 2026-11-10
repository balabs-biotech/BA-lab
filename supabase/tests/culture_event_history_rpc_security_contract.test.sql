-- Least-privilege contract for the tenant-scoped biological event history RPC.
\set ON_ERROR_STOP on

do $$
declare
  v_signature regprocedure;
  v_proc record;
  v_search_path text;
begin
  v_signature := to_regprocedure(
    'public.get_culture_event_history(uuid,uuid,integer,integer)'
  );
  if v_signature is null then
    raise exception 'FAIL: culture event history RPC is missing';
  end if;

  select p.prosecdef, p.proconfig, p.proacl, p.proowner
    into v_proc
    from pg_proc p
   where p.oid = v_signature;

  if not v_proc.prosecdef then
    raise exception 'FAIL: culture event history RPC must be SECURITY DEFINER';
  end if;

  select setting into v_search_path
    from unnest(coalesce(v_proc.proconfig, array[]::text[])) as settings(setting)
   where setting like 'search_path=%'
   limit 1;
  if v_search_path is distinct from 'search_path=pg_catalog' then
    raise exception 'FAIL: culture event history RPC search_path must be pg_catalog: %', v_search_path;
  end if;

  if not has_function_privilege('authenticated', v_signature, 'EXECUTE')
     or has_function_privilege('anon', v_signature, 'EXECUTE')
     or exists (
       select 1
         from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
     ) then
    raise exception 'FAIL: culture event history RPC execute grants are incorrect';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'events'
       and indexname = 'events_org_culture_time_idx'
  ) then
    raise exception 'FAIL: organization-scoped culture event index is missing';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'events'
       and indexname = 'events_org_material_time_idx'
  ) then
    raise exception 'FAIL: organization-scoped material event index is missing';
  end if;
end
$$;

select 'PASS: culture event history RPC security contract' as test_result;
