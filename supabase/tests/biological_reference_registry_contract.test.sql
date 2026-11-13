\set ON_ERROR_STOP on
begin;

do $$
declare
  v_org uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_user uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_profile_id uuid;
  v_reference_id uuid;
begin
  if to_regclass('public.domain_interpretation_profiles') is null then
    raise exception 'domain_interpretation_profiles baseline is missing';
  end if;
  if to_regclass('public.biological_reference_registry') is null then
    raise exception 'biological_reference_registry is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.domain_interpretation_profiles'::regclass) then
    raise exception 'domain_interpretation_profiles must have RLS enabled';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.biological_reference_registry'::regclass) then
    raise exception 'biological_reference_registry must have RLS enabled';
  end if;
  if has_table_privilege('anon','public.biological_reference_registry','SELECT') then
    raise exception 'anonymous access to biological references must be revoked';
  end if;
  if not has_table_privilege('authenticated','public.biological_reference_registry','SELECT') then
    raise exception 'authenticated organization members need reference SELECT privilege';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='biological_reference_registry'
      and policyname='biological_reference_registry_select'
      and qual like '%is_org_member%'
  ) then
    raise exception 'organization member read policy missing from biological reference registry';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='biological_reference_registry'
      and policyname='biological_reference_registry_insert'
      and with_check like '%is_org_admin%'
  ) then
    raise exception 'admin-only reference insert policy missing';
  end if;

  insert into public.organizations(id, code, name)
  values(v_org, 'TEST-BIO-REF-ORG', 'Biological Reference Test')
  on conflict (id) do nothing;
  insert into auth.users(id) values(v_user) on conflict (id) do nothing;
  insert into public.organization_members(organization_id, user_id, role)
  values(v_org, v_user, 'owner') on conflict do nothing;

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  if not private.is_org_admin(v_org) then
    raise exception 'organization owner must pass admin authorization helper';
  end if;

  insert into public.domain_interpretation_profiles(
    organization_id, domain, profile_code, profile_version, rules,
    status, valid_from
  ) values (
    v_org, 'mycology', 'biological.context.features', '1.0.0', '[]'::jsonb,
    'draft', current_date
  ) returning id into v_profile_id;

  update public.domain_interpretation_profiles
    set status='active'
    where id=v_profile_id;

  begin
    update public.domain_interpretation_profiles
      set rules='[{"rule_id":"tampered"}]'::jsonb
      where id=v_profile_id;
    raise exception 'activated interpretation profile was mutable';
  exception when sqlstate '55000' then null;
  end;

  update public.domain_interpretation_profiles
    set status='retired', valid_to=current_date + 1
    where id=v_profile_id;

  insert into public.biological_reference_registry(
    organization_id, reference_id, reference_version, title, citation,
    source_type, evidence_level, content_sha256
  ) values (
    v_org, 'ba-labs.test.reference', '1.0.0',
    'Synthetic registry contract test',
    'Synthetic test citation; not a scientific source.',
    'other', 'L0', repeat('a', 64)
  ) returning id into v_reference_id;

  update public.biological_reference_registry
    set status='validated', reviewed_by=v_user, reviewed_at=now()
    where id=v_reference_id;

  begin
    update public.biological_reference_registry
      set content_sha256=repeat('b', 64)
      where id=v_reference_id;
    raise exception 'validated scientific reference was mutable';
  exception when sqlstate '55000' then null;
  end;

  begin
    delete from public.biological_reference_registry where id=v_reference_id;
    raise exception 'validated scientific reference was deletable';
  exception when sqlstate '55000' then null;
  end;
end
$$;

rollback;
