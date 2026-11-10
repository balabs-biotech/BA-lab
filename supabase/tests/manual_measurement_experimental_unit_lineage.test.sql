-- End-to-end regression for experimental-unit lineage on manual measurements.
-- Runs after the complete migration replay on disposable PostgreSQL 17.
\set ON_ERROR_STOP on

grant usage on schema auth, private, public to authenticated;
grant execute on function auth.uid() to authenticated;

begin;

insert into public.organizations(id, code, name)
values (
  '00000000-0000-0000-0000-0000000000f1',
  'MEAS-UNIT-LINEAGE',
  'Manual measurement unit lineage test'
)
on conflict (id) do nothing;

insert into auth.users(id)
values ('00000000-0000-0000-0000-0000000000f2')
on conflict (id) do nothing;

insert into public.organization_members(organization_id, user_id, role)
values (
  '00000000-0000-0000-0000-0000000000f1',
  '00000000-0000-0000-0000-0000000000f2',
  'member'
)
on conflict (organization_id, user_id) do update set role = excluded.role;

insert into public.organisms(id, scientific_name, common_name)
values (
  '00000000-0000-0000-0000-0000000000f3',
  'Testus measurementis',
  'Measurement lineage test organism'
)
on conflict (id) do nothing;

do $$
declare
  v_material_type text;
  v_culture_type text;
begin
  select code into v_material_type from public.material_types order by code limit 1;
  select code into v_culture_type from public.culture_types order by code limit 1;
  if v_material_type is null or v_culture_type is null then
    raise exception 'Test prerequisites missing: material_types or culture_types seed';
  end if;

  insert into public.strains(organization_id, id, organism_id, strain_code)
  values (
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000f4',
    '00000000-0000-0000-0000-0000000000f3',
    'MEAS-UNIT-LINEAGE-STRAIN'
  )
  on conflict (organization_id, id) do nothing;

  insert into public.materials(organization_id, id, material_code, material_type, strain_id)
  values (
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000f5',
    'MEAS-UNIT-LINEAGE-MATERIAL',
    v_material_type,
    '00000000-0000-0000-0000-0000000000f4'
  )
  on conflict (organization_id, id) do nothing;

  insert into public.experiments(organization_id, id, code, name, design)
  values (
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000f6',
    'MEAS-UNIT-LINEAGE-EXP',
    'Manual measurement unit lineage',
    '{}'::jsonb
  )
  on conflict (organization_id, id) do nothing;

  insert into public.experimental_units(
    organization_id, id, experiment_id, unit_code, replicate_no, treatment_code
  ) values
  (
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000f7',
    '00000000-0000-0000-0000-0000000000f6',
    'MEAS-U01', 1, 'CONTROL'
  ),
  (
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000f8',
    '00000000-0000-0000-0000-0000000000f6',
    'MEAS-U02', 2, 'TREATMENT'
  )
  on conflict (organization_id, id) do nothing;

  insert into public.cultures(
    organization_id, id, code, culture_type, material_id,
    experiment_id, experimental_unit_id, metadata
  ) values (
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000f9',
    'MEAS-UNIT-LINEAGE-CULTURE',
    v_culture_type,
    '00000000-0000-0000-0000-0000000000f5',
    '00000000-0000-0000-0000-0000000000f6',
    '00000000-0000-0000-0000-0000000000f7',
    '{"domain":"laboratory"}'::jsonb
  )
  on conflict (organization_id, id) do nothing;
end
$$;

select set_config('test.variable_code', (select code from public.variables order by code limit 1), true);
select set_config('test.unit_code', (select code from public.units order by code limit 1), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);

do $$
declare
  v_variable_code text;
  v_unit_code text;
  v_event_payload jsonb;
  v_measurement_payload jsonb;
  v_event_id uuid;
  v_retry_event_id uuid;
begin
  v_variable_code := current_setting('test.variable_code');
  v_unit_code := current_setting('test.unit_code');
  if v_variable_code is null or v_unit_code is null then
    raise exception 'Test prerequisites missing: variables or units seed';
  end if;

  v_event_payload := jsonb_build_object(
    'organization_id', '00000000-0000-0000-0000-0000000000f1',
    'event_type', 'measurement_recorded',
    'occurred_at', '2026-11-10T10:00:00Z',
    'culture_id', '00000000-0000-0000-0000-0000000000f9'
  );
  v_measurement_payload := jsonb_build_object(
    'organization_id', '00000000-0000-0000-0000-0000000000f1',
    'variable_code', v_variable_code,
    'raw_value', 12.5,
    'raw_unit_code', v_unit_code,
    'measured_at', '2026-11-10T10:00:00Z',
    'culture_id', '00000000-0000-0000-0000-0000000000f9'
  );

  v_event_id := public.record_manual_measurement(
    v_event_payload,
    v_measurement_payload,
    '00000000-0000-0000-0000-0000000000fa'
  );
  v_retry_event_id := public.record_manual_measurement(
    v_event_payload,
    v_measurement_payload,
    '00000000-0000-0000-0000-0000000000fa'
  );

  if v_retry_event_id is distinct from v_event_id then
    raise exception 'FAIL: idempotent measurement retry returned a different event';
  end if;

  perform set_config('test.manual_measurement_event_id', v_event_id::text, true);

  begin
    perform public.record_manual_measurement(
      v_event_payload,
      v_measurement_payload || jsonb_build_object(
        'experimental_unit_id', '00000000-0000-0000-0000-0000000000f8'
      ),
      '00000000-0000-0000-0000-0000000000fb'
    );
    raise exception 'FAIL: manual measurement accepted a unit different from its culture unit';
  exception when sqlstate '22023' then
    if sqlerrm <> 'culture_experimental_unit_mismatch' then
      raise;
    end if;
  end;
end
$;

reset role;

do $$
declare
  v_event_id uuid := current_setting('test.manual_measurement_event_id')::uuid;
  v_measurement_unit_id uuid;
  v_event_unit_id uuid;
begin
  select m.experimental_unit_id
    into v_measurement_unit_id
    from public.measurements m
   where m.organization_id = '00000000-0000-0000-0000-0000000000f1'
     and m.event_id = v_event_id;
  select e.experimental_unit_id
    into v_event_unit_id
    from public.events e
   where e.organization_id = '00000000-0000-0000-0000-0000000000f1'
     and e.id = v_event_id;

  if v_measurement_unit_id is distinct from '00000000-0000-0000-0000-0000000000f7'::uuid
     or v_event_unit_id is distinct from '00000000-0000-0000-0000-0000000000f7'::uuid then
    raise exception 'FAIL: manual measurement or traceability event lost the culture experimental unit';
  end if;
end
$;

rollback;

select '✓ manual measurement experimental-unit lineage tests passed' as result;
