-- Contract tests for persisted, traceable biological interpretation signals.
\set ON_ERROR_STOP on

do $$
declare
  v_table oid := to_regclass('public.biological_signals');
begin
  if v_table is null then
    raise exception 'FAIL: biological_signals persistence table is missing';
  end if;

  if not (select relrowsecurity from pg_class where oid = v_table) then
    raise exception 'FAIL: biological_signals must enable RLS';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'biological_signals'
       and indexname = 'biological_signals_tenant_idempotency_key'
  ) then
    raise exception 'FAIL: biological signal persistence must be idempotent per analysis/finding/rule/context';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'biological_signals'
       and policyname = 'biological_signals_select'
       and qual like '%is_org_member%'
  ) then
    raise exception 'FAIL: biological signals must be readable only by organization members';
  end if;

  if has_table_privilege('anon', 'public.biological_signals', 'SELECT')
     or has_table_privilege('authenticated', 'public.biological_signals', 'INSERT')
     or has_table_privilege('authenticated', 'public.biological_signals', 'DELETE') then
    raise exception 'FAIL: browser clients must not create or delete engine-generated biological signals';
  end if;

  if not has_table_privilege('service_role', 'public.biological_signals', 'INSERT')
     or not has_table_privilege('service_role', 'public.biological_signals', 'UPDATE') then
    raise exception 'FAIL: trusted analysis gateway requires signal upsert privileges';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = v_table
       and conname = 'biological_signals_context_fk'
  ) or not exists (
    select 1 from pg_constraint
     where conrelid = v_table
       and conname = 'biological_signals_domain_profile_fk'
  ) or not exists (
    select 1 from pg_constraint
     where conrelid = v_table
       and conname = 'biological_signals_environment_profile_fk'
  ) then
    raise exception 'FAIL: signals must retain biological and profile version lineage';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = v_table
       and conname = 'biological_signals_observation_ids_array_check'
  ) or not exists (
    select 1 from pg_constraint
     where conrelid = v_table
       and conname = 'biological_signals_context_tags_array_check'
  ) then
    raise exception 'FAIL: signal provenance arrays must be structurally validated';
  end if;
end
$$;

select 'PASS: biological signal persistence contract' as result;
