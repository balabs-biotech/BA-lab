-- Trusted domain inheritance tests for culture generation; disposable CI database only.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id) values
 ('00000000-0000-0000-0000-00000000c901'),
 ('00000000-0000-0000-0000-00000000c902')
on conflict do nothing;
insert into public.organizations(id,code,name)
values ('00000000-0000-0000-0000-00000000c911','CULTURE-DOMAIN-TEST','Culture domain inheritance test')
on conflict do nothing;
insert into public.organization_members(organization_id,user_id,role)
values
 ('00000000-0000-0000-0000-00000000c911','00000000-0000-0000-0000-00000000c901','owner'),
 ('00000000-0000-0000-0000-00000000c911','00000000-0000-0000-0000-00000000c902','viewer')
on conflict (organization_id,user_id) do update set role=excluded.role;
insert into public.culture_data_consents(organization_id,user_id,terms_version)
values
 ('00000000-0000-0000-0000-00000000c911','00000000-0000-0000-0000-00000000c901','2026-10-09-v1'),
 ('00000000-0000-0000-0000-00000000c911','00000000-0000-0000-0000-00000000c902','2026-10-09-v1')
on conflict (organization_id,user_id,terms_version) do nothing;

insert into public.materials(organization_id,id,material_code,material_type,state,generation,metadata)
values
 ('00000000-0000-0000-0000-00000000c911','00000000-0000-0000-0000-00000000c921','DOMAIN-ROOT-MYC','strain','active',0,'{}'::jsonb),
 ('00000000-0000-0000-0000-00000000c911','00000000-0000-0000-0000-00000000c922','DOMAIN-ROOT-UNKNOWN','strain','active',0,'{}'::jsonb)
on conflict (organization_id,id) do nothing;

-- Exercise the root-material trigger as the migration owner. Authenticated users
-- cannot insert materials directly; their creation path is separately RPC-guarded.
do $root_guard$
begin
  begin
    insert into public.materials(
      organization_id,material_code,material_type,state,metadata
    ) values (
      '00000000-0000-0000-0000-00000000c911','DOMAIN-ROOT-SPOOF','strain',
      'active','{"domain":"laboratory"}'::jsonb
    );
  exception when others then
    if sqlerrm = 'root_material_domain_requires_admin_classification' then
      return;
    end if;
    raise;
  end;
  raise exception 'FAIL: root material self-assigned a workspace domain';
end;
$root_guard$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c901',true);
set local role authenticated;

do $test$
declare
  v_created jsonb;
  v_material_id uuid;
  v_culture_id uuid;
  v_domain text;
  v_rejected boolean := false;
  v_admin_context jsonb;
begin
  -- Root-material workspace assignment is a separate owner/admin decision, not client metadata.
  perform public.classify_legacy_biological_domain(
    '00000000-0000-0000-0000-00000000c911',
    'material',
    '00000000-0000-0000-0000-00000000c921',
    'mycology',
    'Verified root material for workspace inheritance test'
  );
  if public.resolve_material_biological_domain(
       '00000000-0000-0000-0000-00000000c911',
       '00000000-0000-0000-0000-00000000c921'
     ) is distinct from 'mycology' then
    raise exception 'FAIL: material domain resolver ignored audited root classification';
  end if;
  if public.resolve_material_biological_domain(
       '00000000-0000-0000-0000-00000000c911',
       '00000000-0000-0000-0000-00000000c922'
     ) is not null then
    raise exception 'FAIL: unclassified root material received a workspace domain';
  end if;

  v_admin_context := public.get_biological_domain_admin_context(
    '00000000-0000-0000-0000-00000000c911'
  );
  if not exists (
    select 1
      from jsonb_array_elements(v_admin_context->'materials') item
     where item->>'id' = '00000000-0000-0000-0000-00000000c921'
       and item->>'metadata_domain' = 'mycology'
  ) then
    raise exception 'FAIL: admin context did not expose the audited material domain';
  end if;

  -- Client attempts to force laboratory while parent is mycology: server must ignore and inherit mycology.
  v_created := public.create_culture_with_generation(
    '00000000-0000-0000-0000-00000000c911',
    'DOMAIN-CHILD-MYC',
    (select code from public.culture_types order by code limit 1),
    '00000000-0000-0000-0000-00000000c921',
    null,null,null,null,null,now(),
    '{"domain":"laboratory","source":"test"}'::jsonb
  );
  v_material_id := (v_created->>'material_id')::uuid;
  v_culture_id := (v_created->>'culture_id')::uuid;
  if v_created->>'domain' <> 'mycology' then
    raise exception 'FAIL: creation RPC trusted client domain instead of parent';
  end if;
  if (select metadata->>'domain' from public.materials where id=v_material_id) <> 'mycology'
     or (select metadata->>'domain' from public.cultures where id=v_culture_id) <> 'mycology' then
    raise exception 'FAIL: derived material/culture did not inherit parent domain';
  end if;

  -- Derived material cannot spoof a domain that conflicts with its biological parent.
  v_rejected := false;
  begin
    insert into public.materials(
      organization_id,material_code,material_type,parent_material_id,state,metadata
    ) values (
      '00000000-0000-0000-0000-00000000c911','DOMAIN-SPOOF-MATERIAL','derived',
      '00000000-0000-0000-0000-00000000c921','active','{"domain":"laboratory"}'::jsonb
    );
  exception when others then
    if sqlerrm in ('derived_material_domain_mismatch','invalid_biological_domain') then
      v_rejected := true;
    else raise;
    end if;
  end;
  if not v_rejected then raise exception 'FAIL: derived material accepted spoofed domain'; end if;

  -- An unclassified parent cannot be used to create a culture with a client-supplied domain.
  v_rejected := false;
  begin
    perform public.create_culture_with_generation(
      '00000000-0000-0000-0000-00000000c911',
      'DOMAIN-CHILD-UNKNOWN',
      (select code from public.culture_types order by code limit 1),
      '00000000-0000-0000-0000-00000000c922',
      null,null,null,null,null,now(),
      '{"domain":"mycology"}'::jsonb
    );
  exception when others then
    if sqlerrm = 'parent_material_domain_unclassified' then v_rejected := true; else raise; end if;
  end;
  if not v_rejected then raise exception 'FAIL: creation accepted unclassified parent material'; end if;

  -- Direct culture insert also inherits the material domain, and cannot override it.
  v_rejected := false;
  begin
    insert into public.cultures(organization_id,code,culture_type,material_id,metadata)
    values (
      '00000000-0000-0000-0000-00000000c911','DOMAIN-DIRECT-SPOOF',
      (select code from public.culture_types order by code limit 1),
      '00000000-0000-0000-0000-00000000c921','{"domain":"laboratory"}'::jsonb
    );
  exception when others then
    if sqlerrm = 'culture_domain_mismatch_with_parent_material' then v_rejected := true; else raise; end if;
  end;
  if not v_rejected then raise exception 'FAIL: direct culture insert accepted conflicting domain'; end if;

  -- SECURITY DEFINER must not let a read-only viewer create a culture.
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c902',true);
  v_rejected := false;
  begin
    perform public.create_culture_with_generation(
      '00000000-0000-0000-0000-00000000c911',
      'DOMAIN-VIEWER-MUST-FAIL',
      (select code from public.culture_types order by code limit 1),
      '00000000-0000-0000-0000-00000000c921',
      null,null,null,null,null,now(),'{}'::jsonb
    );
  exception when insufficient_privilege then
    if sqlerrm = 'organization_write_access_denied' then v_rejected := true; else raise; end if;
  end;
  if not v_rejected then raise exception 'FAIL: viewer created culture through SECURITY DEFINER RPC'; end if;
end;
$test$;

reset role;
rollback;
select 'PASS: trusted culture domain inheritance and anti-spoofing' as test_result;
