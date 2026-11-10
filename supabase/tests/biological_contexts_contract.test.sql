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
    select 1 from pg_trigger
    where tgrelid = 'public.environments'::regclass
      and tgname = 'environments_biological_context_location_guard'
      and not tgisinternal
  ) then
    raise exception 'FAIL: historical environment location guard is missing';
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

  if not has_table_privilege('service_role', 'public.biological_contexts', 'SELECT') then
    raise exception 'FAIL: authorized server-side context resolution requires service_role SELECT';
  end if;
end
$$;


-- Exercise the location guard with a real tenant/environment/plant subject.
do $
declare
  v_org uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_environment uuid := gen_random_uuid();
  v_plant_culture uuid := gen_random_uuid();
  v_context uuid := gen_random_uuid();
begin
  insert into public.organizations(id, code, name)
  values (v_org, 'BIOCTX-' || replace(v_org::text, '-', ''), 'Biological context contract');

  insert into public.environments(organization_id, id, location_id, name)
  values (v_org, v_environment, null, 'Environment without location');

  insert into public.plant_cultures(
    organization_id, id, code, crop_type, species_name, cultivar_name, environment_id
  ) values (
    v_org, v_plant_culture, 'BIOCTX-PLANT', 'tomato', 'Solanum lycopersicum',
    'Yellow Pear', v_environment
  );

  begin
    insert into public.biological_contexts(
      organization_id, id, domain, plant_culture_id, environment_id,
      organism_kind, culture_stage, production_system, valid_from
    ) values (
      v_org, v_context, 'greentech', v_plant_culture, v_environment,
      'plant', 'vegetative', 'greenhouse', date '2026-11-01'
    );
    raise exception 'FAIL: context accepted an environment without a physical location';
  exception when check_violation then
    null;
  end;

  insert into public.locations(organization_id, id, code, name)
  values (v_org, v_location, 'BIOCTX-LOC', 'Biological context location');

  update public.environments
     set location_id = v_location
   where organization_id = v_org and id = v_environment;

  insert into public.biological_contexts(
    organization_id, id, domain, plant_culture_id, environment_id,
    organism_kind, culture_stage, production_system, context_tags, valid_from, valid_to
  ) values (
    v_org, v_context, 'greentech', v_plant_culture, v_environment,
    'plant', 'vegetative', 'greenhouse', '["trial:one"]'::jsonb,
    date '2026-11-01', date '2026-11-30'
  );

  if not exists (
    select 1 from public.biological_contexts
    where organization_id = v_org and id = v_context
  ) then
    raise exception 'FAIL: valid biological context was not persisted';
  end if;

  begin
    update public.environments
       set location_id = null
     where organization_id = v_org and id = v_environment;
    raise exception 'FAIL: environment location changed after biological context binding';
  exception when check_violation then
    null;
  end;
end
$;

select '✓ biological context persistence contract checks passed' as result;


-- Exercise biological-context RLS with real authenticated roles and two tenants.
-- This runs after full migration replay on disposable PostgreSQL 17.
grant usage on schema auth, private, public to authenticated;
grant execute on function auth.uid() to authenticated;

do $$
declare
  v_org_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_org_b uuid := '00000000-0000-0000-0000-0000000000a2';
  v_viewer uuid := '00000000-0000-0000-0000-0000000000b1';
  v_writer uuid := '00000000-0000-0000-0000-0000000000b2';
  v_location_a uuid := '00000000-0000-0000-0000-0000000000c1';
  v_location_b uuid := '00000000-0000-0000-0000-0000000000c2';
  v_environment_a uuid := '00000000-0000-0000-0000-0000000000d1';
  v_environment_b uuid := '00000000-0000-0000-0000-0000000000d2';
  v_plant_a uuid := '00000000-0000-0000-0000-0000000000e1';
  v_plant_b uuid := '00000000-0000-0000-0000-0000000000e2';
  v_context_a uuid := '00000000-0000-0000-0000-0000000000f1';
  v_context_b uuid := '00000000-0000-0000-0000-0000000000f2';
begin
  insert into public.organizations(id, code, name)
  values
    (v_org_a, 'BIOCTX-RLS-A', 'Biological context RLS A'),
    (v_org_b, 'BIOCTX-RLS-B', 'Biological context RLS B')
  on conflict (id) do nothing;

  insert into auth.users(id) values (v_viewer), (v_writer)
  on conflict (id) do nothing;

  insert into public.organization_members(organization_id, user_id, role)
  values
    (v_org_a, v_viewer, 'viewer'),
    (v_org_a, v_writer, 'member')
  on conflict (organization_id, user_id) do update set role = excluded.role;

  insert into public.locations(organization_id, id, code, name)
  values
    (v_org_a, v_location_a, 'BIOCTX-RLS-LOC-A', 'RLS location A'),
    (v_org_b, v_location_b, 'BIOCTX-RLS-LOC-B', 'RLS location B')
  on conflict (organization_id, id) do nothing;

  insert into public.environments(organization_id, id, location_id, name)
  values
    (v_org_a, v_environment_a, v_location_a, 'RLS environment A'),
    (v_org_b, v_environment_b, v_location_b, 'RLS environment B')
  on conflict (organization_id, id) do nothing;

  insert into public.plant_cultures(
    organization_id, id, code, crop_type, species_name, cultivar_name, environment_id
  ) values
    (v_org_a, v_plant_a, 'BIOCTX-RLS-PLANT-A', 'tomato',
     'Solanum lycopersicum', 'Yellow Pear', v_environment_a),
    (v_org_b, v_plant_b, 'BIOCTX-RLS-PLANT-B', 'tomato',
     'Solanum lycopersicum', 'Marmande', v_environment_b)
  on conflict (organization_id, id) do nothing;

  insert into public.biological_contexts(
    organization_id, id, domain, plant_culture_id, environment_id,
    organism_kind, culture_stage, production_system, valid_from
  ) values
    (v_org_a, v_context_a, 'greentech', v_plant_a, v_environment_a,
     'plant', 'vegetative', 'greenhouse', date '2026-11-01'),
    (v_org_b, v_context_b, 'greentech', v_plant_b, v_environment_b,
     'plant', 'vegetative', 'greenhouse', date '2026-11-01')
  on conflict (organization_id, id) do nothing;
end
$$;

-- Viewer can read only its own tenant and cannot create a biological context.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible from public.biological_contexts;
  if v_visible <> 1 then
    raise exception 'FAIL: viewer must see exactly its own tenant biological context, got %', v_visible;
  end if;

  begin
    insert into public.biological_contexts(
      organization_id, domain, plant_culture_id, environment_id,
      organism_kind, culture_stage, production_system, valid_from
    ) values (
      '00000000-0000-0000-0000-0000000000a1', 'greentech',
      '00000000-0000-0000-0000-0000000000e1',
      '00000000-0000-0000-0000-0000000000d1',
      'plant', 'fruiting', 'greenhouse', date '2026-11-10'
    );
    raise exception 'FAIL: viewer created a biological context';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.biological_contexts(
      organization_id, domain, plant_culture_id, environment_id,
      organism_kind, culture_stage, production_system, valid_from
    ) values (
      '00000000-0000-0000-0000-0000000000a2', 'greentech',
      '00000000-0000-0000-0000-0000000000e2',
      '00000000-0000-0000-0000-0000000000d2',
      'plant', 'fruiting', 'greenhouse', date '2026-11-10'
    );
    raise exception 'FAIL: viewer wrote into another tenant';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
rollback;

-- A member can write within its tenant but cannot cross the tenant boundary.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
insert into public.biological_contexts(
  organization_id, domain, plant_culture_id, environment_id,
  organism_kind, culture_stage, production_system, valid_from
) values (
  '00000000-0000-0000-0000-0000000000a1', 'greentech',
  '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-0000000000d1',
  'plant', 'fruiting', 'greenhouse', date '2026-11-10'
);

do $$
begin
  if (select count(*) from public.biological_contexts) <> 2 then
    raise exception 'FAIL: organization member did not retain intended write access';
  end if;

  begin
    insert into public.biological_contexts(
      organization_id, domain, plant_culture_id, environment_id,
      organism_kind, culture_stage, production_system, valid_from
    ) values (
      '00000000-0000-0000-0000-0000000000a2', 'greentech',
      '00000000-0000-0000-0000-0000000000e2',
      '00000000-0000-0000-0000-0000000000d2',
      'plant', 'fruiting', 'greenhouse', date '2026-11-10'
    );
    raise exception 'FAIL: member wrote into another tenant';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
commit;
