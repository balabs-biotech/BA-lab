do $$
declare
  v_signature regprocedure :=
    'public.get_culture_event_history(uuid,uuid,integer,integer)'::regprocedure;
  v_proc record;
  v_search_path text;
begin
  select p.prosecdef, p.proconfig, p.proacl
    into v_proc
    from pg_proc p
   where p.oid = v_signature;

  if not v_proc.prosecdef then
    raise exception 'FAIL: culture event history RPC must be SECURITY DEFINER';
  end if;

  select setting into v_search_path
    from unnest(v_proc.proconfig) setting
   where setting like 'search_path=%';
  if v_search_path is distinct from 'search_path=pg_catalog' then
    raise exception 'FAIL: culture event history RPC search_path is not pinned';
  end if;

  if has_function_privilege('anon', v_signature, 'EXECUTE') then
    raise exception 'FAIL: anon can execute culture event history RPC';
  end if;
  if not has_function_privilege('authenticated', v_signature, 'EXECUTE') then
    raise exception 'FAIL: authenticated cannot execute culture event history RPC';
  end if;
end
$$;
select 'PASS: culture event history RPC security contract' as test_result;
