-- Catalog-level contract for the batch harvest RPC after full migration replay.
\set ON_ERROR_STOP on

do $$
declare
  v_proc record;
  v_signature regprocedure := 'public.record_batch_harvest(uuid,numeric,text,text)'::regprocedure;
  v_search_path text;
begin
  select p.prosecdef, p.proconfig, p.proacl, p.proowner
    into v_proc
    from pg_proc p
   where p.oid = v_signature;

  if not found then
    raise exception 'FAIL: record_batch_harvest RPC does not exist';
  end if;
  if not v_proc.prosecdef then
    raise exception 'FAIL: harvest RPC must be SECURITY DEFINER to pass protected batch workflow triggers';
  end if;

  select setting into v_search_path
    from unnest(coalesce(v_proc.proconfig, array[]::text[])) as settings(setting)
   where setting like 'search_path=%'
   limit 1;
  if v_search_path is null
     or position('pg_catalog' in v_search_path) = 0
     or position('public' in v_search_path) = 0
     or position('private' in v_search_path) = 0 then
    raise exception 'FAIL: harvest RPC search_path is not explicitly pinned: %', v_search_path;
  end if;

  if not has_function_privilege('authenticated', v_signature, 'EXECUTE') then
    raise exception 'FAIL: authenticated role cannot execute harvest RPC';
  end if;
  if has_function_privilege('anon', v_signature, 'EXECUTE') then
    raise exception 'FAIL: anon role can execute harvest RPC';
  end if;
  if exists (
    select 1 from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'FAIL: PUBLIC can execute harvest RPC';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.batches'::regclass
      and c.conname = 'batches_stage_check'
      and pg_get_constraintdef(c.oid) ilike '%harvest%'
  ) then
    raise exception 'FAIL: batch stage constraint does not allow the configured harvest stage';
  end if;
end
$$;

select '✓ batch harvest RPC privilege and stage contract passed' as result;
