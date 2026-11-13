\set ON_ERROR_STOP on
begin;

do $$
declare
  v_org uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_user uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_organism uuid := gen_random_uuid();
  v_strain uuid := gen_random_uuid();
  v_reference text := 'ba-labs.identity-fixture.' || replace(gen_random_uuid()::text, '-', '');
  v_draft_reference text := 'ba-labs.identity-draft-fixture.' || replace(gen_random_uuid()::text, '-', '');
  v_assertion uuid;
  v_draft_assertion uuid;
begin
  if to_regclass('public.biological_identity_assertions') is null then
    raise exception 'biological_identity_assertions table is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.biological_identity_assertions'::regclass) then
    raise exception 'biological identity assertions must have RLS enabled';
  end if;

  insert into public.organizations(id, code, name)
  values(v_org, 'TEST-BIO-IDENTITY-ORG', 'Biological Identity Test')
  on conflict (id) do nothing;
  insert into auth.users(id) values(v_user) on conflict (id) do nothing;
  insert into public.organization_members(organization_id, user_id, role)
  values(v_org, v_user, 'owner') on conflict do nothing;
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  insert into public.organisms(id, scientific_name, common_name, taxonomy_source, taxonomy_id)
  values(v_organism, 'Syntheticus contractii ' || v_organism::text, 'Synthetic fixture', 'fixture', v_organism::text);

  insert into public.strains(organization_id, id, organism_id, strain_code, designation)
  values(v_org, v_strain, v_organism, 'TEST-' || substr(v_strain::text, 1, 8), 'Synthetic strain fixture');

  insert into public.biological_reference_registry(
    organization_id, reference_id, reference_version, title, citation,
    source_type, evidence_level, content_sha256
  ) values (
    v_org, v_reference, '1.0.0', 'Synthetic identity fixture',
    'Synthetic test citation; not a scientific source.',
    'other', 'L0', repeat('c', 64)
  );

  update public.biological_reference_registry
    set status='validated'
    where organization_id=v_org and reference_id=v_reference and reference_version='1.0.0';

  insert into public.biological_identity_assertions(
    organization_id, assertion_code, assertion_version, subject_type,
    organism_id, strain_id, assertion_type, assertion_value,
    source_reference_id, source_reference_version, evidence_level,
    content_sha256, valid_from
  ) values (
    v_org, 'test.strain.designation.' || substr(v_strain::text, 1, 8), '1.0.0',
    'strain', v_organism, v_strain, 'strain.designation', 'Synthetic strain fixture',
    v_reference, '1.0.0', 'L0', repeat('d', 64), current_date
  ) returning id into v_assertion;

  update public.biological_identity_assertions
    set status='validated'
    where id=v_assertion;

  if not exists (
    select 1 from public.biological_identity_assertions
    where id=v_assertion and reviewed_by=v_user and reviewed_at is not null
  ) then
    raise exception 'identity assertion reviewer must be stamped by database trigger';
  end if;

  insert into public.biological_reference_registry(
    organization_id, reference_id, reference_version, title, citation,
    source_type, evidence_level, content_sha256
  ) values (
    v_org, v_draft_reference, '1.0.0', 'Draft source fixture',
    'Synthetic draft source; not a scientific reference.',
    'other', 'L0', repeat('e', 64)
  );

  insert into public.biological_identity_assertions(
    organization_id, assertion_code, assertion_version, subject_type,
    organism_id, strain_id, assertion_type, assertion_value,
    source_reference_id, source_reference_version, evidence_level,
    content_sha256, valid_from
  ) values (
    v_org, 'test.strain.draft-source.' || substr(v_strain::text, 1, 8), '1.0.0',
    'strain', v_organism, v_strain, 'strain.designation', 'Draft source test',
    v_draft_reference, '1.0.0', 'L0', repeat('f', 64), current_date
  ) returning id into v_draft_assertion;

  begin
    update public.biological_identity_assertions
      set status='validated'
      where id=v_draft_assertion;
    raise exception 'identity assertion was validated against an unvalidated source';
  exception when sqlstate '23514' then null;
  end;

  begin
    update public.biological_identity_assertions
      set organism_id=gen_random_uuid()
      where id=v_assertion;
    raise exception 'identity assertion accepted a strain/organism mismatch';
  exception when sqlstate '23514' then null;
  end;

  begin
    update public.biological_identity_assertions
      set assertion_value='tampered'
      where id=v_assertion;
    raise exception 'validated identity assertion was mutable';
  exception when sqlstate '55000' then null;
  end;
end
$$;

rollback;
