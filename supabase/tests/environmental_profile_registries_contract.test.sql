-- Contract tests for versioned environment and domain interpretation profiles.
\set ON_ERROR_STOP on

do $$
declare
  v_env_table oid := to_regclass('public.environment_context_profiles');
  v_domain_table oid := to_regclass('public.domain_interpretation_profiles');
  v_org uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_environment uuid := gen_random_uuid();
  v_env_profile uuid := gen_random_uuid();
  v_sensor_profile uuid := gen_random_uuid();
  v_sensor_id uuid := gen_random_uuid();
  v_domain_profile uuid := gen_random_uuid();
  v_policy_count integer;
begin
  if v_env_table is null or v_domain_table is null
     or to_regclass('public.environment_context_profile_sensors') is null then
    raise exception 'FAIL: both versioned profile registries must exist';
  end if;

  if not (select relrowsecurity from pg_class where oid = v_env_table)
     or not (select relrowsecurity from pg_class where oid = v_domain_table)
     or not (select relrowsecurity from pg_class where oid = 'public.environment_context_profile_sensors'::regclass) then
    raise exception 'FAIL: profile registries must have RLS enabled';
  end if;

  if not exists (
    select 1 from pg_constraint where conrelid = v_env_table
      and conname = 'environment_context_profiles_environment_fk'
  ) or not exists (
    select 1 from pg_constraint where conrelid = v_domain_table
      and conname = 'domain_interpretation_profiles_domain_check'
  ) then
    raise exception 'FAIL: tenant/domain foreign-key constraints are incomplete';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'environment_context_profiles_one_active_per_environment_idx'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'domain_interpretation_profiles_one_active_per_domain_idx'
  ) then
    raise exception 'FAIL: active profile uniqueness indexes are missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = v_env_table
      and tgname = 'environment_context_profiles_version_guard'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = v_domain_table
      and tgname = 'domain_interpretation_profiles_version_guard'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = v_env_table
      and tgname = 'environment_context_profiles_validate'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = v_domain_table
      and tgname = 'domain_interpretation_profiles_validate'
      and not tgisinternal
  ) then
    raise exception 'FAIL: immutable version lifecycle triggers are missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'environment_context_profiles'
      and policyname = 'environment_context_profiles_select'
      and qual like '%is_org_member%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'domain_interpretation_profiles'
      and policyname = 'domain_interpretation_profiles_select'
      and qual like '%is_org_member%'
  ) then
    raise exception 'FAIL: organization-scoped profile read policies are missing';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename in ('environment_context_profiles', 'domain_interpretation_profiles')
    and cmd in ('INSERT', 'UPDATE', 'DELETE')
    and (
      coalesce(qual, '') like '%is_org_writer%'
      or coalesce(with_check, '') like '%is_org_writer%'
    );
  if v_policy_count <> 6 then
    raise exception 'FAIL: all profile writes must require organization writer role';
  end if;

  if has_table_privilege('anon', 'public.environment_context_profiles', 'SELECT')
     or has_table_privilege('anon', 'public.domain_interpretation_profiles', 'SELECT')
     or has_table_privilege('anon', 'public.environment_context_profile_sensors', 'SELECT') then
    raise exception 'FAIL: anonymous profile access must remain disabled';
  end if;

  insert into public.organizations(id, code, name)
  values (v_org, 'PROFILE-' || replace(v_org::text, '-', ''), 'Profile registry contract');
  insert into public.locations(organization_id, id, code, name, latitude, longitude)
  values (v_org, v_location, 'PROFILE-LOC', 'Profile registry location', 36.19, 5.41);
  insert into public.environments(organization_id, id, location_id, name)
  values (v_org, v_environment, v_location, 'Profile registry environment');

  insert into public.environment_context_profiles(
    organization_id, id, environment_id, profile_code, profile_version,
    context_type, label, timezone, origin,
    valid_from, status
  ) values (
    v_org, v_env_profile, v_environment, 'OUTDOOR-BASE', '1.0.0',
    'outdoor', 'Outdoor site', 'Africa/Algiers', 'weather_provider',
    date '2026-01-01', 'draft'
  );

  update public.environment_context_profiles
     set status = 'active'
   where organization_id = v_org and id = v_env_profile;

  begin
    update public.environment_context_profiles
       set label = 'Changed after activation'
     where organization_id = v_org and id = v_env_profile;
    raise exception 'FAIL: active environment profile content was mutable';
  exception when check_violation then
    null;
  end;

  update public.environment_context_profiles
     set status = 'retired'
   where organization_id = v_org and id = v_env_profile;

  if not exists (
    select 1 from public.environment_context_profiles
     where organization_id = v_org and id = v_env_profile
       and status = 'retired' and valid_to = current_date and retired_at is not null
  ) then
    raise exception 'FAIL: retirement must close the immutable profile validity interval';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.environment_context_profile_sensors'::regclass
      and conname = 'environment_context_profile_sensors_device_fk'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.environment_context_profile_sensors'::regclass
      and conname = 'environment_context_profile_sensors_profile_fk'
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.environment_context_profile_sensors'::regclass
      and tgname = 'environment_context_profile_sensors_guard'
      and not tgisinternal
  ) then
    raise exception 'FAIL: sensor bindings need tenant/environment foreign keys and lifecycle guard';
  end if;

  insert into public.iot_devices(
    id, organization_id, environment_id, device_code, device_type, token_sha256
  ) values (
    v_sensor_id, v_org, v_environment, 'PROFILE-SENSOR', 'climate', repeat('a', 64)
  );

  insert into public.environment_context_profiles(
    organization_id, id, environment_id, profile_code, profile_version,
    context_type, label, timezone, origin, valid_from, status
  ) values (
    v_org, v_sensor_profile, v_environment, 'GREENHOUSE-SENSORS', '1.0.0',
    'greenhouse', 'Greenhouse sensors', 'Africa/Algiers', 'sensor',
    current_date + 1, 'draft'
  );

  begin
    update public.environment_context_profiles
       set status = 'active'
     where organization_id = v_org and id = v_sensor_profile;
    raise exception 'FAIL: sensor profile activated without a sensor binding';
  exception when check_violation then
    null;
  end;

  insert into public.environment_context_profile_sensors(
    organization_id, profile_id, environment_id, sensor_id
  ) values (v_org, v_sensor_profile, v_environment, v_sensor_id);

  update public.environment_context_profiles
     set status = 'active'
   where organization_id = v_org and id = v_sensor_profile;

  begin
    delete from public.environment_context_profile_sensors
     where organization_id = v_org and profile_id = v_sensor_profile
       and sensor_id = v_sensor_id;
    raise exception 'FAIL: active sensor profile binding was mutable';
  exception when check_violation then
    null;
  end;

  begin
    update public.environments
       set location_id = null
     where organization_id = v_org and id = v_environment;
    raise exception 'FAIL: environment location changed after profile activation';
  exception when check_violation then
    null;
  end;

  insert into public.environment_context_profiles(
    organization_id, environment_id, profile_code, profile_version,
    context_type, label, timezone, origin, valid_from, status
  ) values (
    v_org, v_environment, 'OVERLAPPING-VERSION', '1.0.0',
    'greenhouse', 'Overlapping profile', 'Africa/Algiers', 'manual',
    current_date, 'draft'
  );

  begin
    update public.environment_context_profiles
       set status = 'active'
     where organization_id = v_org and profile_code = 'OVERLAPPING-VERSION';
    raise exception 'FAIL: overlapping published environment profile was accepted';
  exception when check_violation then
    null;
  end;

  insert into public.domain_interpretation_profiles(
    organization_id, id, domain, profile_code, profile_version,
    rules, valid_from, status
  ) values (
    v_org, v_domain_profile, 'mycology', 'MYCOLOGY-BASE', '1.0.0',
    '[{"rule_id":"vpd_observation","variable_code":"vpd_kpa","finding_status":"suspect","required_context_tags":[],"signal_code":"vpd_suspect","severity":"moderate","message_code":"vpd_suspect"}]'::jsonb,
    date '2026-01-01', 'draft'
  );

  update public.domain_interpretation_profiles
     set status = 'active'
   where organization_id = v_org and id = v_domain_profile;

  begin
    update public.domain_interpretation_profiles
       set rules = '[]'::jsonb
     where organization_id = v_org and id = v_domain_profile;
    raise exception 'FAIL: active domain rules were mutable';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.domain_interpretation_profiles(
      organization_id, domain, profile_code, profile_version,
      rules, valid_from, status
    ) values (
      v_org, 'mycology', 'MYCOLOGY-OTHER', '1.0.0',
      '[]'::jsonb, date '2026-01-01', 'active'
    );
    raise exception 'FAIL: a second active domain profile was accepted';
  exception when check_violation or unique_violation then
    null;
  end;

  begin
    insert into public.domain_interpretation_profiles(
      organization_id, domain, profile_code, profile_version,
      rules, valid_from, status
    ) values (
      v_org, 'lab', 'LAB-BAD-RULES', '1.0.0',
      '{"not":"an array"}'::jsonb, date '2026-01-01', 'draft'
    );
    raise exception 'FAIL: domain rules accepted a non-array JSON document';
  exception when check_violation then
    null;
  end;
end
$$;

select 'PASS: versioned environment and domain profile registry contracts' as result;
