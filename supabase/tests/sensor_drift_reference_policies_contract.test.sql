-- Contract checks for persisted sensor drift reference policies.
\set ON_ERROR_STOP on

do $$
declare
  v_table oid := to_regclass('public.sensor_drift_reference_policies');
begin
  if v_table is null then
    raise exception 'FAIL: sensor drift reference policy table is missing';
  end if;

  if not (select relrowsecurity from pg_class where oid = v_table) then
    raise exception 'FAIL: sensor drift reference policies must have RLS enabled';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = v_table
       and conname = 'sensor_drift_reference_policies_target_device_fk'
  ) or not exists (
    select 1 from pg_constraint
     where conrelid = v_table
       and conname = 'sensor_drift_reference_policies_reference_device_fk'
  ) or not exists (
    select 1 from pg_constraint
     where conrelid = v_table
       and conname = 'sensor_drift_reference_policies_environment_fk'
  ) then
    raise exception 'FAIL: target/reference devices must be constrained to the same tenant and environment';
  end if;

  if position(
       'sensor_drift_reference_must_remain_draft_during_verification'
       in pg_get_functiondef('private.validate_sensor_drift_reference_policy()'::regprocedure)
     ) = 0
     or position(
       'sensor_drift_reference_binding_cannot_change_after_verification'
       in pg_get_functiondef('private.validate_sensor_drift_reference_policy()'::regprocedure)
     ) = 0 then
    raise exception 'FAIL: reference verification must be a separate step and lock the attested binding';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = v_table
       and conname = 'sensor_drift_reference_policies_verification_check'
  ) or not exists (
    select 1 from pg_trigger
     where tgrelid = v_table
       and tgname = 'sensor_drift_reference_policies_version_guard'
       and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
     where tgrelid = v_table
       and tgname = 'sensor_drift_reference_policies_validate'
       and not tgisinternal
  ) then
    raise exception 'FAIL: reference verification and immutable lifecycle guards are required';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'sensor_drift_reference_policies_one_active_target_variable_idx'
  ) then
    raise exception 'FAIL: active policy uniqueness index is missing';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'sensor_drift_reference_policies'
       and policyname = 'sensor_drift_reference_policies_select'
       and qual like '%is_org_member%'
  ) or not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'sensor_drift_reference_policies'
       and policyname = 'sensor_drift_reference_policies_insert'
       and with_check like '%is_org_writer%'
  ) or not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'sensor_drift_reference_policies'
       and policyname = 'sensor_drift_reference_policies_update'
       and qual like '%is_org_writer%'
       and with_check like '%is_org_writer%'
  ) or not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'sensor_drift_reference_policies'
       and policyname = 'sensor_drift_reference_policies_delete'
       and qual like '%is_org_writer%'
  ) then
    raise exception 'FAIL: tenant member read and writer-only mutation policies are incomplete';
  end if;

  if has_table_privilege('anon', 'public.sensor_drift_reference_policies', 'SELECT')
     or has_table_privilege('anon', 'public.sensor_drift_reference_policies', 'INSERT')
     or has_table_privilege('anon', 'public.sensor_drift_reference_policies', 'UPDATE')
     or has_table_privilege('anon', 'public.sensor_drift_reference_policies', 'DELETE') then
    raise exception 'FAIL: anonymous access must remain disabled';
  end if;

  if not has_table_privilege('authenticated', 'public.sensor_drift_reference_policies', 'SELECT')
     or not has_table_privilege('service_role', 'public.sensor_drift_reference_policies', 'SELECT') then
    raise exception 'FAIL: authenticated member reads and server-side policy resolution must be granted';
  end if;
end
$$;

select 'PASS: sensor drift reference policy persistence contract' as result;
