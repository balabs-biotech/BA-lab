-- Contract tests for biological context persistence. Run after full migration replay.
\set ON_ERROR_STOP on

do $$
declare
  v_table oid := to_regclass('public.biological_contexts');
  v_policy_count integer;
  v_constraint_count integer;
begin
  if v_table is null then
    raise exception 'FAIL: biological_contexts table is missing';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = v_table and attname = 'culture_id' and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = v_table and attname = 'plant_culture_id' and not attisdropped
  ) then
    raise exception 'FAIL: explicit culture and plant-culture references are required';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_table and conname = 'biological_contexts_one_subject_check'
  ) then
    raise exception 'FAIL: exactly-one-subject constraint is missing';
  end if;

  select count(*) into v_constraint_count
  from pg_constraint
  where conrelid = v_table and contype = 'f'
    and conname in (
      'biological_contexts_culture_fk',
      'biological_contexts_plant_culture_fk',
      'biological_contexts_environment_fk'
    );
  if v_constraint_count <> 3 then
    raise exception 'FAIL: tenant-scoped subject/environment foreign keys are incomplete';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_table and conname = 'biological_contexts_validity_check'
  ) then
    raise exception 'FAIL: temporal validity constraint is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = v_table and conname = 'biological_contexts_domain_subject_check'
  ) then
    raise exception 'FAIL: domain/subject compatibility constraint is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = v_table
      and tgname = 'biological_contexts_environment_location_guard'
      and not tgisinternal
  ) then
    raise exception 'FAIL: environment-to-location guard trigger is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'biological_contexts'
      and policyname = 'biological_contexts_select'
      and qual like '%is_org_member%'
  ) then
    raise exception 'FAIL: organization-scoped read policy is missing';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'biological_contexts'
    and cmd in ('INSERT', 'UPDATE', 'DELETE')
    and (
      coalesce(qual, '') like '%is_org_writer%'
      or coalesce(with_check, '') like '%is_org_writer%'
    );
  if v_policy_count <> 3 then
    raise exception 'FAIL: all writes must require organization writer role';
  end if;

  if has_table_privilege('anon', 'public.biological_contexts', 'SELECT')
     or has_table_privilege('anon', 'public.biological_contexts', 'INSERT') then
    raise exception 'FAIL: anonymous access must remain disabled';
  end if;
end
$$;

select '✓ biological context persistence contract checks passed' as result;
