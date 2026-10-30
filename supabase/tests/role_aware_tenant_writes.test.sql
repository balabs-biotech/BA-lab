-- Regression test for 20261029100000_enforce_role_aware_tenant_writes.sql.
-- Runs after the complete migration replay on disposable PostgreSQL 17.
\set ON_ERROR_STOP on

grant usage on schema auth, private, public to authenticated;
grant execute on function auth.uid() to authenticated;

do $$
declare
  v_org uuid := '00000000-0000-0000-0000-0000000000a1';
  v_viewer uuid := '00000000-0000-0000-0000-0000000000b1';
  v_member uuid := '00000000-0000-0000-0000-0000000000b2';
  v_owner uuid := '00000000-0000-0000-0000-0000000000b3';
  v_organism uuid := '00000000-0000-0000-0000-0000000000c1';
  v_strain uuid := '00000000-0000-0000-0000-0000000000d1';
  v_material uuid := '00000000-0000-0000-0000-0000000000e1';
  v_material_type text;
begin
  if to_regprocedure('private.is_org_writer(uuid)') is null then
    raise exception 'FAIL: private.is_org_writer(uuid) is missing';
  end if;

  insert into public.organizations(id, code, name)
  values (v_org, 'ROLE-AUTH-TEST', 'Role authorization test')
  on conflict (id) do nothing;

  insert into auth.users(id) values (v_viewer), (v_member), (v_owner)
  on conflict (id) do nothing;

  insert into public.organization_members(organization_id, user_id, role)
  values
    (v_org, v_viewer, 'viewer'),
    (v_org, v_member, 'member'),
    (v_org, v_owner, 'owner')
  on conflict (organization_id, user_id) do update set role = excluded.role;

  insert into public.organisms(id, scientific_name, common_name)
  values (v_organism, 'Testus rolecheck', 'Role check organism')
  on conflict (id) do nothing;

  select code into v_material_type from public.material_types order by code limit 1;
  if v_material_type is null then
    raise exception 'FAIL: no material_types seed available for batch RPC test';
  end if;

  insert into public.strains(organization_id, id, organism_id, strain_code)
  values (v_org, v_strain, v_organism, 'ROLE-CHECK-STRAIN')
  on conflict (organization_id, id) do nothing;

  insert into public.materials(organization_id, id, material_code, material_type, strain_id)
  values (v_org, v_material, 'ROLE-CHECK-MATERIAL', v_material_type, v_strain)
  on conflict (organization_id, id) do nothing;

  perform set_config('request.jwt.claim.sub', v_viewer::text, true);
  if private.is_org_writer(v_org) then
    raise exception 'FAIL: viewer was classified as a writer';
  end if;

  perform set_config('request.jwt.claim.sub', v_member::text, true);
  if not private.is_org_writer(v_org) then
    raise exception 'FAIL: member was not classified as a writer';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  if not private.is_org_writer(v_org) then
    raise exception 'FAIL: owner was not classified as a writer';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  if private.is_org_writer(v_org) then
    raise exception 'FAIL: role check must not grant writes without an authenticated session';
  end if;
end
$$;

grant select, insert on public.strains to authenticated;

-- Direct RLS write: viewer must be denied.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$
begin
  begin
    insert into public.strains(organization_id, organism_id, strain_code)
    values ('00000000-0000-0000-0000-0000000000a1',
            '00000000-0000-0000-0000-0000000000c1', 'VIEWER-MUST-FAIL');
    raise exception 'FAIL: viewer inserted a tenant strain';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.record_manual_measurement(
      jsonb_build_object('organization_id', '00000000-0000-0000-0000-0000000000a1',
                         'event_type', 'measurement_recorded'),
      jsonb_build_object('variable_code', 'viewer-test', 'raw_value', 1,
                         'raw_unit_code', 'unit')
    );
    raise exception 'FAIL: viewer wrote a manual measurement';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.record_manual_observation(
      jsonb_build_object('organization_id', '00000000-0000-0000-0000-0000000000a1',
                         'event_type', 'observation_recorded'),
      jsonb_build_object('variable_code', 'viewer-test', 'value_text', 'must fail')
    );
    raise exception 'FAIL: viewer wrote a manual observation';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.record_biological_operation(
      '00000000-0000-0000-0000-0000000000a1',
      '00000000-0000-0000-0000-0000000000d1',
      'repiquage'
    );
    raise exception 'FAIL: viewer recorded a biological operation';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.create_batch_with_stages(
      '00000000-0000-0000-0000-0000000000a1',
      'VIEWER-BATCH-MUST-FAIL', 'Viewer batch', 'FORMULATION',
      null, '00000000-0000-0000-0000-0000000000e1',
      null, null, null, null, null, null,
      array['preparation','formulation','packaging','qc','release']::text[]
    );
    raise exception 'FAIL: viewer created a batch through SECURITY DEFINER RPC';
  exception when others then
    if sqlerrm not like '%not authorized for organization%' then
      raise;
    end if;
  end;
end
$$;
rollback;

-- A member must retain intended data-write and batch-creation capabilities.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
insert into public.strains(organization_id, organism_id, strain_code)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000c1', 'MEMBER-MAY-WRITE')
on conflict (organization_id, strain_code) do nothing;
select public.create_batch_with_stages(
  '00000000-0000-0000-0000-0000000000a1',
  'MEMBER-BATCH-MAY-CREATE', 'Member batch', 'FORMULATION',
  null, '00000000-0000-0000-0000-0000000000e1',
  null, null, null, null, null, null,
  array['preparation','formulation','packaging','qc','release']::text[]
);
commit;

-- The migration must also update the privileged workflow RPC authorization checks.
do $$
declare
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.create_batch_with_stages(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,text,text[])'::regprocedure,
    'public.advance_batch_stage(uuid,text)'::regprocedure,
    'public.release_batch(uuid)'::regprocedure,
    'public.move_batch_to_location(uuid,uuid,uuid,text)'::regprocedure,
    'public.record_batch_harvest(uuid,numeric,text,text)'::regprocedure,
    'public.record_manual_measurement(jsonb,jsonb)'::regprocedure,
    'public.record_manual_observation(jsonb,jsonb)'::regprocedure,
    'public.record_biological_operation(uuid,uuid,text,timestamptz,text,jsonb,text[])'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    if v_definition like '%private.is_org_member(%' then
      raise exception 'FAIL: mutation RPC % still authorizes on membership alone', v_signature;
    end if;
    if v_definition not like '%private.is_org_writer(%' then
      raise exception 'FAIL: mutation RPC % does not enforce writer role', v_signature;
    end if;
  end loop;
end
$$;

select '✓ role-aware tenant write regression tests passed' as result;
