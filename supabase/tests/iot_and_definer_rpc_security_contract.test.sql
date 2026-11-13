-- Regression contract for the server-only IoT registry and tenant-scoped
-- SECURITY DEFINER RPCs. Run after a full migration replay on disposable PostgreSQL.
\set ON_ERROR_STOP on

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_config text[];
  v_helper regprocedure := 'private.is_org_writer(uuid)'::regprocedure;
  v_helper_definition text;
  v_table text;
begin
  -- The shared authorization helper must derive authorization from auth.uid()
  -- and the organization membership table, never caller-supplied metadata.
  select pg_get_functiondef(v_helper) into v_helper_definition;
  if v_helper_definition not ilike '%auth.uid()%'
     or v_helper_definition not ilike '%organization_members%'
     or v_helper_definition not ilike '%owner%'
     or v_helper_definition not ilike '%admin%'
     or v_helper_definition not ilike '%member%' then
    raise exception 'FAIL: private.is_org_writer must resolve authenticated writer membership';
  end if;
  if has_function_privilege('anon', v_helper, 'EXECUTE') then
    raise exception 'FAIL: anon must not execute private.is_org_writer';
  end if;

  -- These are intentionally authenticated RPC entry points. Their SECURITY
  -- DEFINER privilege is acceptable only while each enforces the shared
  -- organization-writer guard and pins search_path.
  foreach v_signature in array array[
    'public.advance_batch_stage(uuid,text)'::regprocedure,
    'public.create_batch_with_stages(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,text,text[])'::regprocedure,
    'public.move_batch_to_location(uuid,uuid,uuid,text)'::regprocedure,
    'public.record_batch_harvest(uuid,numeric,text,text)'::regprocedure,
    'public.record_biological_operation(uuid,uuid,text,timestamptz,text,jsonb,text[])'::regprocedure,
    'public.record_manual_measurement(jsonb,jsonb)'::regprocedure,
    'public.record_manual_observation(jsonb,jsonb)'::regprocedure,
    'public.release_batch(uuid)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature), p.proconfig
      into v_definition, v_config
      from pg_proc p
     where p.oid = v_signature;

    if not (select p.prosecdef from pg_proc p where p.oid = v_signature) then
      raise exception 'FAIL: expected SECURITY DEFINER contract for %', v_signature;
    end if;
    if has_function_privilege('anon', v_signature, 'EXECUTE') then
      raise exception 'FAIL: anon can execute privileged RPC %', v_signature;
    end if;
    if not has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      raise exception 'FAIL: authenticated lost intended RPC access to %', v_signature;
    end if;
    if v_definition not ilike '%private.is_org_writer(%' then
      raise exception 'FAIL: RPC % is missing organization-writer authorization', v_signature;
    end if;
    if coalesce(array_to_string(v_config, ','), '') not ilike '%search_path=%' then
      raise exception 'FAIL: RPC % does not pin search_path', v_signature;
    end if;
  end loop;

  -- IoT credentials and idempotency receipts remain backend-only. RLS is
  -- enabled as defense in depth; no client policies or table grants are expected.
  foreach v_table in array array['iot_devices','iot_ingest_receipts'] loop
    if not (select c.relrowsecurity
              from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relname=v_table) then
      raise exception 'FAIL: RLS is not enabled on public.%', v_table;
    end if;
    if exists (
      select 1 from pg_policy pol
      join pg_class c on c.oid=pol.polrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=v_table
    ) then
      raise exception 'FAIL: public.% must remain without client-facing RLS policies', v_table;
    end if;
    if has_table_privilege('anon', 'public.'||v_table, 'SELECT,INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated', 'public.'||v_table, 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'FAIL: client role has direct privileges on public.%', v_table;
    end if;
  end loop;
end
$$;

select '✓ IoT and SECURITY DEFINER RPC security contract passed' as result;
