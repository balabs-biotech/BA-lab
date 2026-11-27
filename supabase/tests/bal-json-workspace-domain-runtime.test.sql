-- Runtime behavior tests for BAL-JSON biological workspace resolution.
-- Executed only after full migration replay in disposable CI PostgreSQL.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id) values
 ('00000000-0000-0000-0000-00000000b901'),
 ('00000000-0000-0000-0000-00000000b902')
on conflict do nothing;
insert into public.organizations(id,code,name)
values ('00000000-0000-0000-0000-00000000b911','BALJSON-DOMAIN-TEST','BAL-JSON domain test')
on conflict do nothing;
insert into public.organization_members(organization_id,user_id,role)
values
 ('00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b901','owner'),
 ('00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b902','member')
on conflict (organization_id,user_id) do update set role=excluded.role;

insert into public.materials(organization_id,id,material_code,material_type,state,metadata)
select '00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b921','BALJSON-MYC','strain','active','{}'::jsonb
where not exists(select 1 from public.materials where organization_id='00000000-0000-0000-0000-00000000b911' and id='00000000-0000-0000-0000-00000000b921');
insert into public.materials(organization_id,id,material_code,material_type,state,metadata)
select '00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b922','BALJSON-LAB','strain','active','{}'::jsonb
where not exists(select 1 from public.materials where organization_id='00000000-0000-0000-0000-00000000b911' and id='00000000-0000-0000-0000-00000000b922');

-- Assign trusted workspace classifications before creating linked cultures.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b901',true);
set local role authenticated;
select public.classify_legacy_biological_domain(
  '00000000-0000-0000-0000-00000000b911','material',
  '00000000-0000-0000-0000-00000000b921','mycology',
  'Verified mycology material test fixture'
);
select public.classify_legacy_biological_domain(
  '00000000-0000-0000-0000-00000000b911','material',
  '00000000-0000-0000-0000-00000000b922','laboratory',
  'Verified laboratory material test fixture'
);
reset role;

-- Corrupt legacy material fixture: bypass the new root-domain guard only for this historical inconsistency.
alter table public.materials disable trigger materials_domain_insert_guard;
insert into public.materials(organization_id,id,material_code,material_type,state,metadata)
select '00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b923','BALJSON-CONFLICT','strain','active','{"domain":"laboratory"}'::jsonb
where not exists(select 1 from public.materials where organization_id='00000000-0000-0000-0000-00000000b911' and id='00000000-0000-0000-0000-00000000b923');
alter table public.materials enable trigger materials_domain_insert_guard;

insert into public.cultures(organization_id,id,code,culture_type,material_id,metadata)
select '00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b931','BALJSON-CULTURE-MYC',
       (select code from public.culture_types order by code limit 1),
       '00000000-0000-0000-0000-00000000b921','{"domain":"mycology"}'::jsonb
where not exists(select 1 from public.cultures where organization_id='00000000-0000-0000-0000-00000000b911' and id='00000000-0000-0000-0000-00000000b931');
insert into public.cultures(organization_id,id,code,culture_type,material_id,metadata)
select '00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b932','BALJSON-CULTURE-LAB',
       (select code from public.culture_types order by code limit 1),
       '00000000-0000-0000-0000-00000000b922','{"domain":"laboratory"}'::jsonb
where not exists(select 1 from public.cultures where organization_id='00000000-0000-0000-0000-00000000b911' and id='00000000-0000-0000-0000-00000000b932');
-- Deliberately model a corrupt historical row so the resolver's fail-closed behavior is tested.
-- The production trigger correctly rejects this mismatch; disable it only around this fixture insert.
alter table public.cultures disable trigger cultures_domain_insert_guard;
insert into public.cultures(organization_id,id,code,culture_type,material_id,metadata)
select '00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b933','BALJSON-CULTURE-CONFLICT',
       (select code from public.culture_types order by code limit 1),
       '00000000-0000-0000-0000-00000000b923','{"domain":"mycology"}'::jsonb
where not exists(select 1 from public.cultures where organization_id='00000000-0000-0000-0000-00000000b911' and id='00000000-0000-0000-0000-00000000b933');
alter table public.cultures enable trigger cultures_domain_insert_guard;

-- Legacy records have no metadata.domain and require explicit owner/admin classification.
insert into public.materials(organization_id,id,material_code,material_type,state,metadata)
values ('00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b924',
        'BALJSON-LEGACY-MATERIAL','strain','active','{}'::jsonb)
on conflict do nothing;
insert into public.cultures(organization_id,id,code,culture_type,material_id,metadata)
select '00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b934',
       'BALJSON-LEGACY-CULTURE',(select code from public.culture_types order by code limit 1),
       '00000000-0000-0000-0000-00000000b924','{}'::jsonb
where not exists(select 1 from public.cultures where organization_id='00000000-0000-0000-0000-00000000b911' and id='00000000-0000-0000-0000-00000000b934');

insert into public.plant_cultures(organization_id,id,code,crop_type,species_name,cultivar_name,metadata)
values ('00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b941',
        'BALJSON-PLANT','vegetable','Solanum lycopersicum','Test cultivar','{}'::jsonb)
on conflict do nothing;

insert into public.batches(organization_id,id,batch_code,name,batch_type,material_id,culture_id)
values
 ('00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b951','BALJSON-BATCH-MYC','Mycology batch','culture','00000000-0000-0000-0000-00000000b921','00000000-0000-0000-0000-00000000b931'),
 ('00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b952','BALJSON-BATCH-MATERIAL','Material-only batch','material','00000000-0000-0000-0000-00000000b922',null),
 ('00000000-0000-0000-0000-00000000b911','00000000-0000-0000-0000-00000000b953','BALJSON-BATCH-CONFLICT','Conflicting batch','culture','00000000-0000-0000-0000-00000000b923','00000000-0000-0000-0000-00000000b933')
on conflict do nothing;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b901',true);
set local role authenticated;

-- Ordinary members cannot classify legacy biological records.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b902',true);
do $member$
declare v_denied boolean := false;
begin
  begin
    perform public.classify_legacy_biological_domain(
      '00000000-0000-0000-0000-00000000b911','material',
      '00000000-0000-0000-0000-00000000b924','mycology',
      'Verified legacy fungal material'
    );
  exception when insufficient_privilege then
    if sqlerrm = 'domain_classification_requires_admin' then v_denied := true; else raise; end if;
  end;
  if not v_denied then raise exception 'FAIL: ordinary member classified a legacy record'; end if;

  v_denied := false;
  begin
    perform public.get_biological_domain_admin_context(
      '00000000-0000-0000-0000-00000000b911'
    );
  exception when insufficient_privilege then
    if sqlerrm = 'domain_classification_requires_admin' then v_denied := true; else raise; end if;
  end;
  if not v_denied then raise exception 'FAIL: ordinary member accessed the admin classification catalogue'; end if;
end $member$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b901',true);

do $$
declare
  v_org uuid := '00000000-0000-0000-0000-00000000b911';
  v_result text;
  v_caught boolean;
begin
  v_result := public.resolve_bal_json_domain(v_org,'00000000-0000-0000-0000-00000000b931',null,null);
  if v_result is distinct from 'mycology' then raise exception 'FAIL: mycology culture resolved as %',v_result; end if;

  v_result := public.resolve_bal_json_domain(v_org,'00000000-0000-0000-0000-00000000b932',null,null);
  if v_result is distinct from 'laboratory' then raise exception 'FAIL: laboratory culture resolved as %',v_result; end if;

  v_result := public.resolve_bal_json_domain(v_org,null,'00000000-0000-0000-0000-00000000b941',null);
  if v_result is distinct from 'agronomy' then raise exception 'FAIL: plant culture did not resolve to agronomy'; end if;

  v_result := public.resolve_bal_json_domain(v_org,null,null,'00000000-0000-0000-0000-00000000b952');
  if v_result is distinct from 'laboratory' then raise exception 'FAIL: material-only batch resolved as %',v_result; end if;

  v_result := public.resolve_bal_json_domain(v_org,'00000000-0000-0000-0000-00000000b931',null,'00000000-0000-0000-0000-00000000b951');
  if v_result is distinct from 'mycology' then raise exception 'FAIL: culture-linked batch resolved as %',v_result; end if;

  v_result := public.resolve_bal_json_domain(v_org,'00000000-0000-0000-0000-00000000b933',null,null);
  if v_result is not null then raise exception 'FAIL: culture/material domain conflict was accepted'; end if;

  v_result := public.resolve_bal_json_domain(v_org,null,null,'00000000-0000-0000-0000-00000000b953');
  if v_result is not null then raise exception 'FAIL: conflicting batch material/culture domains were accepted'; end if;

  v_caught := false;
  begin
    perform public.resolve_bal_json_domain(v_org,'00000000-0000-0000-0000-00000000b931',null,'00000000-0000-0000-0000-00000000b952');
  exception when others then
    if sqlerrm = 'batch_culture_mismatch' then v_caught := true; else raise; end if;
  end;
  if not v_caught then raise exception 'FAIL: mismatched explicit culture and batch anchors were accepted'; end if;


  -- Owner/admin classification is auditable and becomes the resolver's source for legacy records.
  perform public.classify_legacy_biological_domain(
    v_org,'material','00000000-0000-0000-0000-00000000b924',
    'mycology','Verified fungal strain registry entry'
  );
  v_result := public.resolve_bal_json_domain(v_org,'00000000-0000-0000-0000-00000000b934',null,null);
  if v_result is distinct from 'mycology' then raise exception 'FAIL: legacy culture did not inherit audited material classification'; end if;

  if public.is_bal_json_variable_allowed('mycology','cfu') is not true
     or public.is_bal_json_variable_allowed('mycology','root_length') is not false
     or public.is_bal_json_variable_allowed('agronomy','root_length') is not true
     or public.is_bal_json_variable_allowed('agronomy','cfu') is not false then
    raise exception 'FAIL: workspace variable allowlist returned an invalid decision';
  end if;
end
$$;

reset role;
do $$
begin
  if (select count(*) from private.biological_domain_classification_audit
       where organization_id='00000000-0000-0000-0000-00000000b911'
         and target_type='material'
         and target_id='00000000-0000-0000-0000-00000000b924') <> 1 then
    raise exception 'FAIL: legacy domain classification audit receipt missing';
  end if;
end $$;
rollback;
select 'PASS: BAL-JSON workspace domain resolution runtime scenarios' as test_result;
