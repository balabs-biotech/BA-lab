-- Catalog-level security regression test for atomic manual-write RPCs.
-- Runs after the complete versioned migration replay on disposable PostgreSQL 17.
\set ON_ERROR_STOP on

do $$
declare
  v_signature regprocedure;
  v_proc record;
  v_setting text;
begin
  foreach v_signature in array array[
    'public.record_manual_measurement(jsonb,jsonb,uuid)'::regprocedure,
    'public.record_manual_observation(jsonb,jsonb,uuid)'::regprocedure
  ] loop
    select p.prosecdef, p.proconfig, p.proacl, p.proowner
      into v_proc
      from pg_proc p
     where p.oid = v_signature;

    if not found then
      raise exception 'FAIL: expected RPC % does not exist', v_signature;
    end if;

    if not v_proc.prosecdef then
      raise exception 'FAIL: % must be SECURITY DEFINER to support revoked direct table writes', v_signature;
    end if;

    select setting into v_setting
      from unnest(coalesce(v_proc.proconfig, array[]::text[])) as settings(setting)
     where setting like 'search_path=%'
     limit 1;

    if v_setting is null or regexp_replace(v_setting, '^search_path=', '') <> 'pg_catalog' then
      raise exception 'FAIL: % must pin search_path to pg_catalog; got %', v_signature, v_setting;
    end if;

    if not has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      raise exception 'FAIL: authenticated role cannot execute %', v_signature;
    end if;

    if has_function_privilege('anon', v_signature, 'EXECUTE') then
      raise exception 'FAIL: anon role can execute %', v_signature;
    end if;

    if exists (
      select 1
        from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
       where a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) then
      raise exception 'FAIL: PUBLIC can execute %', v_signature;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'private.operation_idempotency_receipts', 'SELECT')
     or has_table_privilege('authenticated', 'private.operation_idempotency_receipts', 'INSERT')
     or has_table_privilege('anon', 'private.operation_idempotency_receipts', 'SELECT') then
    raise exception 'FAIL: clients must not access manual write idempotency receipts directly';
  end if;

  if not (select relrowsecurity from pg_class where oid='private.operation_idempotency_receipts'::regclass) then
    raise exception 'FAIL: private idempotency receipt table must have RLS enabled';
  end if;

  if has_function_privilege('authenticated', 'public.record_manual_measurement(jsonb,jsonb)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.record_manual_observation(jsonb,jsonb)'::regprocedure, 'EXECUTE') then
    raise exception 'FAIL: legacy non-idempotent manual write RPC overloads remain executable';
  end if;

  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.events'::regclass
       and c.conname = 'events_single_biological_anchor_check'
       and pg_get_constraintdef(c.oid) ilike '%plant_culture_id%'
       and pg_get_constraintdef(c.oid) ilike '%num_nonnulls%'
  ) then
    raise exception 'FAIL: event biological-anchor constraint does not include plant cultures';
  end if;
end
$$;

select '✓ atomic manual-write RPC privilege and execution-context contract passed' as result;
