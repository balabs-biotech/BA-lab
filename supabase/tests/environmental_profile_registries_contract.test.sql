-- Contract tests for the persisted environmental and domain profile registries.
-- Run after replaying the complete migration chain on disposable PostgreSQL.
\set ON_ERROR_STOP on

begin;

do $$
declare
  v_org uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_environment uuid := gen_random_uuid();
  v_env_a uuid := gen_random_uuid();
  v_env_b uuid := gen_random_uuid();
  v_env_c uuid := gen_random_uuid();
  v_env_open uuid := gen_random_uuid();
  v_env_successor uuid := gen_random_uuid();
  v_domain_a uuid := gen_random_uuid();
  v_domain_b uuid := gen_random_uuid();
  v_domain_c uuid := gen_random_uuid();
  v_domain_open uuid := gen_random_uuid();
  v_domain_successor uuid := gen_random_uuid();
  v_function record;
begin
  -- Schema, row security and tenant-scoped constraints.
  if to_regclass('public.environment_context_profiles') is null
     or to_regclass('public.domain_interpretation_profiles') is null
     or to_regclass('public.environment_context_profile_sensors') is null then
    raise exception 'FAIL: versioned profile registry tables are missing';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.environment_context_profiles'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.domain_interpretation_profiles'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.environment_context_profile_sensors'::regclass) then
    raise exception 'FAIL: all profile registry tables must have RLS enabled';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.environment_context_profiles'::regclass
      and conname = 'environment_context_profiles_environment_fk'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.environment_context_profiles'::regclass
      and conname = 'environment_context_profiles_valid_window'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.domain_interpretation_profiles'::regclass
      and conname = 'domain_interpretation_profiles_domain_check'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.domain_interpretation_profiles'::regclass
      and conname = 'domain_interpretation_profiles_rules_check'
  ) then
    raise exception 'FAIL: required profile domain, tenant or validity constraints are missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.environment_context_profiles'::regclass
      and tgname = 'environment_context_profiles_immutable' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.environment_context_profiles'::regclass
      and tgname = 'environment_context_profiles_no_delete' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.environment_context_profiles'::regclass
      and tgname = 'environment_context_profiles_resolution_window' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.domain_interpretation_profiles'::regclass
      and tgname = 'domain_interpretation_profiles_immutable' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.domain_interpretation_profiles'::regclass
      and tgname = 'domain_interpretation_profiles_no_delete' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.domain_interpretation_profiles'::regclass
      and tgname = 'domain_interpretation_profiles_resolution_window' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.environment_context_profile_sensors'::regclass
      and tgname = 'environment_context_profile_sensors_draft_only' and not tgisinternal
  ) then
    raise exception 'FAIL: profile immutability, lifecycle or resolution-window triggers are missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'environment_context_profiles'
      and policyname = 'environment_context_profiles_select'
      and qual like '%is_org_member%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'environment_context_profiles'
      and policyname = 'environment_context_profiles_insert'
      and coalesce(with_check, '') like '%is_org_writer%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'domain_interpretation_profiles'
      and policyname = 'domain_interpretation_profiles_select'
      and qual like '%is_org_member%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'domain_interpretation_profiles'
      and policyname = 'domain_interpretation_profiles_insert'
      and coalesce(with_check, '') like '%is_org_writer%'
  ) then
    raise exception 'FAIL: organization-scoped profile read/write policies are missing';
  end if;

  if has_table_privilege('anon', 'public.environment_context_profiles', 'SELECT')
     or has_table_privilege('anon', 'public.domain_interpretation_profiles', 'SELECT')
     or has_table_privilege('anon', 'public.environment_context_profile_sensors', 'SELECT') then
    raise exception 'FAIL: anonymous profile access must remain disabled';
  end if;

  if has_table_privilege('authenticated', 'public.environment_context_profiles', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.domain_interpretation_profiles', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.environment_context_profile_sensors', 'TRIGGER') then
    raise exception 'FAIL: authenticated profile grants exceed row-scoped CRUD';
  end if;

  for v_function in
    select p.oid, p.prosecdef, p.proconfig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'guard_environment_profile_resolution_window',
        'guard_domain_profile_resolution_window'
      )
  loop
    if not v_function.prosecdef
       or not (v_function.proconfig @> array['search_path=pg_catalog, public']) then
      raise exception 'FAIL: % must be SECURITY DEFINER with a fixed search_path', v_function.proname;
    end if;
    if has_function_privilege('anon', v_function.oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_function.oid, 'EXECUTE') then
      raise exception 'FAIL: API roles must not directly execute %', v_function.proname;
    end if;
  end loop;

  if (select count(*) from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='private'
        and p.proname in ('guard_environment_profile_resolution_window','guard_domain_profile_resolution_window')) <> 2 then
    raise exception 'FAIL: both resolver-window trigger functions must exist';
  end if;

  -- Create one tenant and one physical environment for environment profile cases.
  insert into public.organizations(id, code, name)
  values (v_org, 'PROFILE-' || replace(v_org::text, '-', ''), 'Profile registry contract');

  insert into public.locations(organization_id, id, code, name, latitude, longitude)
  values (v_org, v_location, 'PROFILE-LOC', 'Profile registry location', 36.19, 5.41);

  insert into public.environments(organization_id, id, location_id, name)
  values (v_org, v_environment, v_location, 'Profile registry environment');

  -- An inclusive end date overlaps a successor starting on that same date,
  -- even when the two profiles use different profile_code values.
  insert into public.environment_context_profiles(
    organization_id, id, environment_id, profile_code, profile_version,
    context_type, label, timezone, origin, status, valid_from, valid_to
  ) values (
    v_org, v_env_a, v_environment, 'ENV-A', '1.0.0',
    'fruiting_chamber', 'Environment A', 'Africa/Algiers', 'manual',
    'draft', date '2026-01-01', date '2026-01-31'
  );

  update public.environment_context_profiles set status='active'
  where organization_id=v_org and id=v_env_a;

  insert into public.environment_context_profiles(
    organization_id, id, environment_id, profile_code, profile_version,
    context_type, label, timezone, origin, status, valid_from, valid_to
  ) values (
    v_org, v_env_b, v_environment, 'ENV-B', '1.0.0',
    'fruiting_chamber', 'Environment B', 'Africa/Algiers', 'manual',
    'draft', date '2026-01-31', date '2026-02-15'
  );

  begin
    update public.environment_context_profiles set status='active'
    where organization_id=v_org and id=v_env_b;
    raise exception 'TEST_FAILURE: inclusive environment boundary overlap was accepted';
  exception
    when sqlstate '23P01' then null;
  end;

  -- A next-day successor is allowed.
  insert into public.environment_context_profiles(
    organization_id, id, environment_id, profile_code, profile_version,
    context_type, label, timezone, origin, status, valid_from, valid_to
  ) values (
    v_org, v_env_c, v_environment, 'ENV-C', '1.0.0',
    'fruiting_chamber', 'Environment C', 'Africa/Algiers', 'manual',
    'draft', date '2026-02-01', date '2026-02-28'
  );

  update public.environment_context_profiles set status='active'
  where organization_id=v_org and id=v_env_c;

  -- An open-ended active profile can be retired only by closing its validity.
  insert into public.environment_context_profiles(
    organization_id, id, environment_id, profile_code, profile_version,
    context_type, label, timezone, origin, status, valid_from, valid_to
  ) values (
    v_org, v_env_open, v_environment, 'ENV-OPEN', '1.0.0',
    'fruiting_chamber', 'Open environment profile', 'Africa/Algiers', 'manual',
    'draft', date '2026-03-01', null
  );

  update public.environment_context_profiles set status='active'
  where organization_id=v_org and id=v_env_open;

  begin
    update public.environment_context_profiles set status='retired'
    where organization_id=v_org and id=v_env_open;
    raise exception 'TEST_FAILURE: open-ended profile retired without valid_to';
  exception
    when sqlstate 'P0001' then
      if sqlerrm = 'TEST_FAILURE: open-ended profile retired without valid_to' then raise; end if;
  end;

  begin
    update public.environment_context_profiles
       set status='retired', valid_to=date '2026-03-15', label='Tampered'
     where organization_id=v_org and id=v_env_open;
    raise exception 'TEST_FAILURE: scientific content changed during retirement';
  exception
    when sqlstate 'P0001' then
      if sqlerrm = 'TEST_FAILURE: scientific content changed during retirement' then raise; end if;
  end;

  update public.environment_context_profiles
     set status='retired', valid_to=date '2026-03-15'
   where organization_id=v_org and id=v_env_open;

  insert into public.environment_context_profiles(
    organization_id, id, environment_id, profile_code, profile_version,
    context_type, label, timezone, origin, status, valid_from, valid_to
  ) values (
    v_org, v_env_successor, v_environment, 'ENV-OPEN-SUCCESSOR', '1.0.0',
    'fruiting_chamber', 'Successor environment profile', 'Africa/Algiers', 'manual',
    'draft', date '2026-03-16', null
  );

  update public.environment_context_profiles set status='active'
  where organization_id=v_org and id=v_env_successor;

  begin
    update public.environment_context_profiles set status='active'
    where organization_id=v_org and id=v_env_open;
    raise exception 'TEST_FAILURE: retired environment profile was reactivated';
  exception
    when sqlstate 'P0001' then
      if sqlerrm = 'TEST_FAILURE: retired environment profile was reactivated' then raise; end if;
  end;

  -- Domain profile resolution has the same tenant+domain scope, across codes.
  insert into public.domain_interpretation_profiles(
    organization_id, id, domain, profile_code, profile_version,
    rules, status, valid_from, valid_to
  ) values (
    v_org, v_domain_a, 'mycology', 'DOMAIN-A', '1.0.0',
    '[]'::jsonb, 'draft', date '2026-01-01', date '2026-01-31'
  );

  update public.domain_interpretation_profiles set status='active'
  where organization_id=v_org and id=v_domain_a;

  insert into public.domain_interpretation_profiles(
    organization_id, id, domain, profile_code, profile_version,
    rules, status, valid_from, valid_to
  ) values (
    v_org, v_domain_b, 'mycology', 'DOMAIN-B', '1.0.0',
    '[]'::jsonb, 'draft', date '2026-01-31', date '2026-02-15'
  );

  begin
    update public.domain_interpretation_profiles set status='active'
    where organization_id=v_org and id=v_domain_b;
    raise exception 'TEST_FAILURE: inclusive domain boundary overlap was accepted';
  exception
    when sqlstate '23P01' then null;
  end;

  insert into public.domain_interpretation_profiles(
    organization_id, id, domain, profile_code, profile_version,
    rules, status, valid_from, valid_to
  ) values (
    v_org, v_domain_c, 'mycology', 'DOMAIN-C', '1.0.0',
    '[]'::jsonb, 'draft', date '2026-02-01', date '2026-02-28'
  );

  update public.domain_interpretation_profiles set status='active'
  where organization_id=v_org and id=v_domain_c;

  insert into public.domain_interpretation_profiles(
    organization_id, id, domain, profile_code, profile_version,
    rules, status, valid_from, valid_to
  ) values (
    v_org, v_domain_open, 'greentech', 'DOMAIN-OPEN', '1.0.0',
    '[]'::jsonb, 'draft', date '2026-03-01', null
  );

  update public.domain_interpretation_profiles set status='active'
  where organization_id=v_org and id=v_domain_open;

  update public.domain_interpretation_profiles
     set status='retired', valid_to=date '2026-03-15'
   where organization_id=v_org and id=v_domain_open;

  insert into public.domain_interpretation_profiles(
    organization_id, id, domain, profile_code, profile_version,
    rules, status, valid_from, valid_to
  ) values (
    v_org, v_domain_successor, 'greentech', 'DOMAIN-OPEN-SUCCESSOR', '1.0.0',
    '[]'::jsonb, 'draft', date '2026-03-16', null
  );

  update public.domain_interpretation_profiles set status='active'
  where organization_id=v_org and id=v_domain_successor;
end
$$;

rollback;

select 'PASS: versioned profile registry and temporal resolver contracts' as result;
