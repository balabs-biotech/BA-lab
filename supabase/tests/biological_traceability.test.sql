-- Runtime regression tests for biological traceability RPC.
-- Runs only in disposable CI PostgreSQL 17; never run against production.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
end $$;
create schema if not exists auth;
create schema if not exists private;
-- The preceding SQL tests share this disposable database; clear only fixture tables.
drop table if exists public.results cascade;
drop table if exists public.experimental_units cascade;
drop table if exists public.experiments cascade;
drop table if exists public.batches cascade;
drop table if exists public.events cascade;
drop table if exists public.material_relationships cascade;
drop table if exists public.cultures cascade;
drop table if exists public.materials cascade;
drop table if exists public.strains cascade;
drop table if exists public.material_types cascade;
drop table if exists public.culture_types cascade;
drop table if exists public.organization_members cascade;
drop table if exists public.organizations cascade;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.organizations(id uuid primary key);
create table public.organization_members(organization_id uuid not null, user_id uuid not null, primary key(organization_id,user_id));
create or replace function private.is_org_member(p_org uuid) returns boolean
  language sql stable security definer set search_path = pg_catalog, public
  as $writer$ select exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=auth.uid()) $writer$;
create or replace function private.is_org_writer(p_org uuid) returns boolean
  language sql stable security definer set search_path = pg_catalog, public
  as $writer$ select exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=auth.uid()) $writer$;
create table public.material_types(code text primary key);
create table public.culture_types(code text primary key);
create table public.strains(organization_id uuid not null, id uuid not null default gen_random_uuid(), primary key(organization_id,id));
create table public.materials(
  organization_id uuid not null references public.organizations(id),
  id uuid not null default gen_random_uuid(), material_code text not null, material_type text not null references public.material_types(code),
  strain_id uuid, parent_material_id uuid, state text not null, generation integer, metadata jsonb not null default '{}'::jsonb,
  primary key(organization_id,id), unique(organization_id,material_code),
  foreign key(organization_id,parent_material_id) references public.materials(organization_id,id),
  foreign key(organization_id,strain_id) references public.strains(organization_id,id)
);
create table public.cultures(
  organization_id uuid not null references public.organizations(id), id uuid not null default gen_random_uuid(), code text not null,
  culture_type text not null references public.culture_types(code), material_id uuid not null, parent_culture_id uuid,
  experiment_id uuid, experimental_unit_id uuid,
  started_at timestamptz, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  primary key(organization_id,id), unique(organization_id,code),
  foreign key(organization_id,material_id) references public.materials(organization_id,id),
  foreign key(organization_id,parent_culture_id) references public.cultures(organization_id,id)
);
create table public.material_relationships(
  organization_id uuid not null references public.organizations(id), id uuid not null default gen_random_uuid(),
  parent_material_id uuid not null, child_material_id uuid not null, relationship_type text not null, created_at timestamptz not null default now(),
  primary key(organization_id,id), unique(organization_id,parent_material_id,child_material_id,relationship_type),
  check(parent_material_id <> child_material_id),
  foreign key(organization_id,parent_material_id) references public.materials(organization_id,id),
  foreign key(organization_id,child_material_id) references public.materials(organization_id,id)
);
create table public.batches(
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  culture_id uuid not null,
  primary key(organization_id,id),
  foreign key(organization_id,culture_id) references public.cultures(organization_id,id)
);
do $fixture$ begin
  create type public.quality_state as enum ('raw','controlled','validated','excluded');
exception when duplicate_object then null; end $fixture$;
create table public.experiments(
  organization_id uuid not null references public.organizations(id),
  id uuid not null default gen_random_uuid(),
  code text not null,
  primary key(organization_id,id),
  unique(organization_id,code)
);
create table public.experimental_units(
  organization_id uuid not null,
  id uuid not null default gen_random_uuid(),
  experiment_id uuid not null,
  unit_code text not null,
  primary key(organization_id,id),
  unique(organization_id,experiment_id,unit_code),
  foreign key(organization_id,experiment_id) references public.experiments(organization_id,id)
);
alter table public.cultures add constraint cultures_experiment_id_fkey
  foreign key(organization_id,experiment_id) references public.experiments(organization_id,id) on delete set null;
alter table public.cultures add constraint cultures_experimental_unit_id_fkey
  foreign key(organization_id,experimental_unit_id) references public.experimental_units(organization_id,id) on delete set null;
create table public.results(
  organization_id uuid not null references public.organizations(id),
  id uuid not null default gen_random_uuid(),
  experiment_id uuid,
  experimental_unit_id uuid,
  code text not null,
  result_type text,
  value jsonb not null default '{}'::jsonb,
  quality_state public.quality_state not null default 'raw',
  created_at timestamptz not null default now(),
  primary key(organization_id,id),
  unique(organization_id,code),
  foreign key(organization_id,experiment_id) references public.experiments(organization_id,id),
  foreign key(organization_id,experimental_unit_id) references public.experimental_units(organization_id,id)
);
create table public.events(
  organization_id uuid not null references public.organizations(id), id uuid not null default gen_random_uuid(), event_type text not null,
  occurred_at timestamptz not null, actor_user_id uuid references auth.users(id), culture_id uuid, material_id uuid,
  sample_id uuid, experimental_unit_id uuid, batch_id uuid, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  primary key(organization_id,id),
  check(num_nonnulls(culture_id,material_id,sample_id,experimental_unit_id)=1),
  foreign key(organization_id,culture_id) references public.cultures(organization_id,id)
);
insert into public.organizations(id) values
 ('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000a2');
insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000b1');
insert into public.organization_members values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1');
insert into public.material_types(code) values ('strain'),('culture_derived');
insert into public.culture_types(code) values ('agar'),('solid');
insert into public.materials(organization_id,material_code,material_type,state,generation) values
 ('00000000-0000-0000-0000-0000000000a1','MAT-PARENT','strain','active',0),
 ('00000000-0000-0000-0000-0000000000a2','MAT-OTHER-ORG','strain','active',0);
insert into public.cultures(organization_id,code,culture_type,material_id) values
 ('00000000-0000-0000-0000-0000000000a1','PARENT-001','agar',(select id from public.materials where organization_id='00000000-0000-0000-0000-0000000000a1' and material_code='MAT-PARENT')),
 ('00000000-0000-0000-0000-0000000000a2','OTHER-ORG-001','agar',(select id from public.materials where organization_id='00000000-0000-0000-0000-0000000000a2' and material_code='MAT-OTHER-ORG'));
grant usage on schema public, private, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant select on public.organization_members to authenticated, anon;
grant select,insert,update,delete on public.material_types,public.culture_types,public.organizations,public.strains,public.materials,public.cultures,public.material_relationships,public.events,public.batches to authenticated,anon;
grant select,insert,update,delete on public.experiments,public.experimental_units,public.results to authenticated,anon;

\i supabase/migrations/20261111100000_enforce_culture_experimental_context.sql

-- Regression contract: a culture's experiment must be the experiment that owns its unit.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
do $experimental_context_integrity$
declare
  v_experiment_a uuid;
  v_experiment_b uuid;
  v_unit_a uuid;
  v_unit_b uuid;
  v_culture_id uuid;
  caught boolean := false;
begin
  insert into public.experiments(organization_id,code)
  values ('00000000-0000-0000-0000-0000000000a1','EXP-CONTEXT-A')
  returning id into v_experiment_a;
  insert into public.experiments(organization_id,code)
  values ('00000000-0000-0000-0000-0000000000a1','EXP-CONTEXT-B')
  returning id into v_experiment_b;
  insert into public.experimental_units(organization_id,experiment_id,unit_code)
  values ('00000000-0000-0000-0000-0000000000a1',v_experiment_a,'UNIT-A')
  returning id into v_unit_a;
  insert into public.experimental_units(organization_id,experiment_id,unit_code)
  values ('00000000-0000-0000-0000-0000000000a1',v_experiment_b,'UNIT-B')
  returning id into v_unit_b;

  insert into public.cultures(organization_id,code,culture_type,material_id,experiment_id,experimental_unit_id)
  select '00000000-0000-0000-0000-0000000000a1','EXP-CONTEXT-CULTURE','agar',m.id,v_experiment_a,v_unit_a
    from public.materials m
   where m.organization_id='00000000-0000-0000-0000-0000000000a1'
     and m.material_code='MAT-PARENT'
  returning id into v_culture_id;

  begin
    update public.cultures
       set experimental_unit_id=v_unit_b
     where organization_id='00000000-0000-0000-0000-0000000000a1'
       and id=v_culture_id;
  exception when foreign_key_violation then caught := true;
  end;
  if not caught then
    raise exception 'FAIL: culture accepted an experimental unit owned by another experiment';
  end if;

  caught := false;
  begin
    update public.cultures
       set experimental_unit_id=null
     where organization_id='00000000-0000-0000-0000-0000000000a1'
       and id=v_culture_id;
  exception when check_violation then caught := true;
  end;
  if not caught then
    raise exception 'FAIL: culture accepted an experiment without its experimental unit';
  end if;

  delete from public.experimental_units
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and id=v_unit_a;
  if exists (
    select 1 from public.cultures
     where organization_id='00000000-0000-0000-0000-0000000000a1'
       and id=v_culture_id
       and (experiment_id is not null or experimental_unit_id is not null)
  ) then
    raise exception 'FAIL: deleting an experimental unit left a dangling culture experiment reference';
  end if;
end
$experimental_context_integrity$;
alter table public.materials enable row level security;
alter table public.cultures enable row level security;
alter table public.material_relationships enable row level security;
alter table public.events enable row level security;
alter table public.batches enable row level security;
alter table public.results enable row level security;
create policy materials_org on public.materials to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create policy cultures_org on public.cultures to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create policy relationships_org on public.material_relationships to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create policy events_org on public.events to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create policy batches_org on public.batches to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create policy results_org on public.results to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
\i supabase/migrations/20261022021957_biological_traceability_v1.sql
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
\i supabase/migrations/20261109170000_sync_material_parent_relationships.sql
set role authenticated;
do $material_edge$
declare
  parent_id uuid;
  derived_id uuid;
  alternate_parent_id uuid;
  edge_type text;
begin
  select id into parent_id from public.materials
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and material_code='MAT-PARENT';
  insert into public.materials(
    organization_id, material_code, material_type, strain_id,
    parent_material_id, state, generation, metadata
  )
  select '00000000-0000-0000-0000-0000000000a1', 'MAT-DIRECT-DERIVATION',
         'culture_derived', strain_id, parent_id, 'active', 1,
         '{"generation_method":"culture_propagation"}'::jsonb
    from public.materials
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and id=parent_id
  returning id into derived_id;
  select relationship_type into edge_type
    from public.material_relationships
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and parent_material_id=parent_id and child_material_id=derived_id;
  if edge_type is distinct from 'culture_propagation' then
    raise exception 'FAIL: material insert did not create its typed parent relationship';
  end if;

  insert into public.materials(
    organization_id, material_code, material_type, state, generation
  ) values (
    '00000000-0000-0000-0000-0000000000a1', 'MAT-ALT-PARENT',
    'strain', 'active', 0
  ) returning id into alternate_parent_id;

  update public.materials
     set parent_material_id = alternate_parent_id
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and id=derived_id;

  if exists (
    select 1 from public.material_relationships
     where organization_id='00000000-0000-0000-0000-0000000000a1'
       and parent_material_id=parent_id and child_material_id=derived_id
       and relationship_type='culture_propagation'
  ) then
    raise exception 'FAIL: reparenting left a stale typed material edge';
  end if;
  if not exists (
    select 1 from public.material_relationships
     where organization_id='00000000-0000-0000-0000-0000000000a1'
       and parent_material_id=alternate_parent_id and child_material_id=derived_id
       and relationship_type='culture_propagation'
  ) then
    raise exception 'FAIL: reparenting did not create the new typed material edge';
  end if;
end
$material_edge$;
reset role;
\i supabase/migrations/20261109210000_harden_biological_lineage_cycle_guards.sql
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
set role authenticated;
do $lineage_cycle_guard$
declare
  root_culture uuid;
  child_culture uuid;
  root_material uuid;
  derived_material uuid;
  caught boolean;
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
     where p.oid='private.prevent_material_cycle()'::regprocedure
       and not p.prosecdef
       and p.proconfig @> array['search_path=pg_catalog']
  ) then
    raise exception 'FAIL: material cycle trigger function security contract is invalid';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
     where p.oid='private.prevent_culture_cycle()'::regprocedure
       and not p.prosecdef
       and p.proconfig @> array['search_path=pg_catalog']
  ) then
    raise exception 'FAIL: culture cycle trigger function security contract is invalid';
  end if;
  if has_function_privilege('authenticated','private.prevent_material_cycle()','execute')
     or has_function_privilege('authenticated','private.prevent_culture_cycle()','execute') then
    raise exception 'FAIL: authenticated can execute private lineage trigger functions directly';
  end if;

  select id into root_culture from public.cultures
   where organization_id='00000000-0000-0000-0000-0000000000a1' and code='PARENT-001';
  insert into public.cultures(organization_id,code,culture_type,material_id,parent_culture_id)
  select organization_id,'CYCLE-CHILD','agar',material_id,root_culture
    from public.cultures where organization_id='00000000-0000-0000-0000-0000000000a1' and id=root_culture
  returning id into child_culture;

  caught := false;
  begin
    update public.cultures set parent_culture_id=child_culture
     where organization_id='00000000-0000-0000-0000-0000000000a1' and id=root_culture;
  exception when check_violation then
    if sqlerrm='culture_lineage_cycle_detected' then caught := true; else raise; end if;
  end;
  if not caught then raise exception 'FAIL: direct culture reparenting created a lineage cycle'; end if;
  if (select parent_culture_id from public.cultures where organization_id='00000000-0000-0000-0000-0000000000a1' and id=root_culture) is not null then
    raise exception 'FAIL: rejected culture reparenting changed the stored parent';
  end if;
  delete from public.cultures where organization_id='00000000-0000-0000-0000-0000000000a1' and id=child_culture;

  select id into root_material from public.materials
   where organization_id='00000000-0000-0000-0000-0000000000a1' and material_code='MAT-ALT-PARENT';
  select id into derived_material from public.materials
   where organization_id='00000000-0000-0000-0000-0000000000a1' and material_code='MAT-DIRECT-DERIVATION';
  caught := false;
  begin
    update public.materials set parent_material_id=derived_material
     where organization_id='00000000-0000-0000-0000-0000000000a1' and id=root_material;
  exception when check_violation then
    if sqlerrm='material_lineage_cycle_detected' then caught := true; else raise; end if;
  end;
  if not caught then raise exception 'FAIL: direct material reparenting created a lineage cycle'; end if;
  if (select parent_material_id from public.materials where organization_id='00000000-0000-0000-0000-0000000000a1' and id=root_material) is not null then
    raise exception 'FAIL: rejected material reparenting changed the stored parent';
  end if;
end
$lineage_cycle_guard$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
set role authenticated;
do $existing_operation$
declare result jsonb; parent_id uuid; child_id uuid; v_child_material_id uuid; event_count integer; caught boolean;
begin
  select id into parent_id from public.cultures where organization_id='00000000-0000-0000-0000-0000000000a1' and code='PARENT-001';
  result := public.record_biological_operation('00000000-0000-0000-0000-0000000000a1',parent_id,'division_aliquotes',now(),'test transaction','{"conditions":"agar 24C","outcome":"en_cours"}'::jsonb,array['CHILD-A','CHILD-B']);
  if jsonb_array_length(result->'children') <> 2 then raise exception 'FAIL: expected two descendants'; end if;
  select id,material_id into child_id,v_child_material_id from public.cultures where organization_id='00000000-0000-0000-0000-0000000000a1' and code='CHILD-A';
  if not exists(select 1 from public.cultures where organization_id='00000000-0000-0000-0000-0000000000a1' and code='CHILD-A' and parent_culture_id=parent_id) then raise exception 'FAIL: child culture lineage missing'; end if;
  if not exists(select 1 from public.materials where organization_id='00000000-0000-0000-0000-0000000000a1' and id=v_child_material_id and parent_material_id=(select material_id from public.cultures where id=parent_id) and generation=1) then raise exception 'FAIL: child material lineage/generation missing'; end if;
  if not exists(select 1 from public.material_relationships where organization_id='00000000-0000-0000-0000-0000000000a1' and child_material_id=v_child_material_id) then raise exception 'FAIL: material relationship missing'; end if;
  select count(*) into event_count from public.events where organization_id='00000000-0000-0000-0000-0000000000a1' and culture_id in (parent_id, (select id from public.cultures where code='CHILD-A'), (select id from public.cultures where code='CHILD-B'));
  if event_count <> 3 then raise exception 'FAIL: expected operation event and two descendant events, got %',event_count; end if;
  caught := false;
  begin perform public.record_biological_operation('00000000-0000-0000-0000-0000000000a2',(select id from public.cultures where organization_id='00000000-0000-0000-0000-0000000000a2' and code='OTHER-ORG-001'),'repiquage',now(),null,'{}'::jsonb,array['CROSS-ORG-CHILD']);
  exception when insufficient_privilege then caught := true; end;
  if not caught then raise exception 'FAIL: cross-organization RPC call was allowed'; end if;
  caught := false;
  begin perform public.record_biological_operation('00000000-0000-0000-0000-0000000000a1',parent_id,'not-a-real-operation',now(),null,'{}'::jsonb,array[]::text[]);
  exception when others then if sqlerrm='unsupported_biological_operation' then caught := true; else raise; end if; end;
  if not caught then raise exception 'FAIL: unsupported operation was accepted'; end if;
  caught := false;
  begin perform public.record_biological_operation('00000000-0000-0000-0000-0000000000a1',parent_id,'repiquage',now(),null,'{}'::jsonb,array['CHILD-A']);
  exception when others then if sqlerrm like 'culture_code_already_exists:%' then caught := true; else raise; end if; end;
  if not caught then raise exception 'FAIL: duplicate child code was accepted'; end if;
  if exists(select 1 from public.cultures where organization_id='00000000-0000-0000-0000-0000000000a1' and code='CROSS-ORG-CHILD') then raise exception 'FAIL: cross-org child was created'; end if;
  if has_function_privilege('anon','public.record_biological_operation(uuid,uuid,text,timestamptz,text,jsonb,text[])','execute') then raise exception 'FAIL: anon can execute biological operation RPC'; end if;
end $existing_operation$;
reset role;
select 'PASS: biological traceability runtime, lineage, RLS boundary, input validation and grants' as test_result;

-- Idempotency regression: a retry after an unknown client outcome must return
-- the original result without creating another operation or descendant.
\i supabase/migrations/20261109100000_add_biological_operation_idempotency.sql
\i supabase/migrations/20261110120000_record_experiment_result_rpc.sql
set role authenticated;
do $$
declare
  first_result jsonb;
  retry_result jsonb;
  event_id uuid;
  event_count integer;
  child_count integer;
  caught boolean := false;
  request_key uuid := '00000000-0000-0000-0000-0000000000c1';
  parent_id uuid;
  fixed_time timestamptz := '2026-11-09T10:00:00Z';
begin
  select id into parent_id from public.cultures
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and code='PARENT-001';

  first_result := public.record_biological_operation(
    '00000000-0000-0000-0000-0000000000a1', parent_id, 'repiquage',
    request_key, fixed_time, 'idempotency test', '{"conditions":"agar 24C"}'::jsonb,
    array['IDEMP-CHILD-A']
  );
  retry_result := public.record_biological_operation(
    '00000000-0000-0000-0000-0000000000a1', parent_id, 'repiquage',
    request_key, fixed_time, 'idempotency test', '{"conditions":"agar 24C"}'::jsonb,
    array['IDEMP-CHILD-A']
  );

  if first_result is distinct from retry_result then
    raise exception 'FAIL: an identical retry must return the original result';
  end if;

  event_id := (first_result->>'event_id')::uuid;
  select count(*) into event_count from public.events
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and id=event_id;
  select count(*) into child_count from public.cultures
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and code='IDEMP-CHILD-A';
  if event_count <> 1 or child_count <> 1 then
    raise exception 'FAIL: retry duplicated biological records (events %, children %)', event_count, child_count;
  end if;

  begin
    perform public.record_biological_operation(
      '00000000-0000-0000-0000-0000000000a1', parent_id, 'repiquage',
      request_key, fixed_time, 'different request with same key', '{"conditions":"agar 24C"}'::jsonb,
      array['IDEMP-CHILD-A']
    );
  exception when others then
    if sqlerrm = 'idempotency_key_reused_with_different_payload' then
      caught := true;
    else
      raise;
    end if;
  end;
  if not caught then
    raise exception 'FAIL: reusing an idempotency key with a different payload must be rejected';
  end if;

  if (select count(*) from public.cultures
      where organization_id='00000000-0000-0000-0000-0000000000a1'
        and code='IDEMP-CHILD-A') <> 1 then
    raise exception 'FAIL: conflicting retry changed biological state';
  end if;
end $$;
reset role;
select 'PASS: biological operation idempotency, duplicate suppression and payload conflict rejection' as test_result;

-- Structured experimental result writes are atomic, tenant-bound and idempotent.
insert into public.experiments(organization_id,code)
values ('00000000-0000-0000-0000-0000000000a1','EXP-RESULT-001');
insert into public.experimental_units(organization_id,experiment_id,unit_code)
select organization_id,id,'REP-01' from public.experiments
 where organization_id='00000000-0000-0000-0000-0000000000a1'
   and code='EXP-RESULT-001';
set role authenticated;
do $experiment_result$
declare
  first_result jsonb;
  retry_result jsonb;
  result_id uuid;
  v_event_id uuid;
  caught boolean := false;
  unit_id uuid;
  request_key uuid := '00000000-0000-0000-0000-0000000000c2';
  fixed_time timestamptz := '2026-11-10T10:00:00Z';
begin
  select id into unit_id from public.experimental_units
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and unit_code='REP-01';
  first_result := public.record_experiment_result(
    '00000000-0000-0000-0000-0000000000a1',unit_id,'RES-001','growth_assessment',
    '{"colony_diameter_mm":42.5,"replicate":"REP-01"}'::jsonb,'raw',request_key,fixed_time
  );
  retry_result := public.record_experiment_result(
    '00000000-0000-0000-0000-0000000000a1',unit_id,'RES-001','growth_assessment',
    '{"colony_diameter_mm":42.5,"replicate":"REP-01"}'::jsonb,'raw',request_key,fixed_time
  );
  if first_result is distinct from retry_result then
    raise exception 'FAIL: identical experimental-result retry did not return original response';
  end if;
  result_id := (first_result->>'result_id')::uuid;
  v_event_id := (first_result->>'event_id')::uuid;
  if (select count(*) from public.results r
       where organization_id='00000000-0000-0000-0000-0000000000a1'
         and r.id=result_id and r.experiment_id=(select experiment_id from public.experimental_units where id=unit_id)
         and r.experimental_unit_id=unit_id and r.event_id=v_event_id and r.code='RES-001'
         and r.result_type='growth_assessment'
         and r.value='{"colony_diameter_mm":42.5,"replicate":"REP-01"}'::jsonb
         and r.quality_state='raw') <> 1 then
    raise exception 'FAIL: structured experimental result was not persisted with experiment and unit provenance';
  end if;
  if (select count(*) from public.events
       where organization_id='00000000-0000-0000-0000-0000000000a1'
         and id=v_event_id and event_type='experiment_result_recorded'
         and experimental_unit_id=unit_id and payload->>'result_id'=result_id::text) <> 1 then
    raise exception 'FAIL: result traceability event is missing or disconnected';
  end if;
  begin
    perform public.record_experiment_result(
      '00000000-0000-0000-0000-0000000000a1',unit_id,'RES-001','growth_assessment',
      '{"colony_diameter_mm":43}'::jsonb,'raw',request_key,fixed_time
    );
  exception when others then
    if sqlerrm='idempotency_key_reused_with_different_payload' then caught := true;
    else raise; end if;
  end;
  if not caught then raise exception 'FAIL: changed payload reused an experimental-result idempotency key'; end if;
  caught := false;
  begin
    perform public.record_experiment_result(
      '00000000-0000-0000-0000-0000000000a2',unit_id,'RES-CROSS-ORG','growth_assessment',
      '{"value":1}'::jsonb,'raw','00000000-0000-0000-0000-0000000000c3',fixed_time
    );
  exception when insufficient_privilege then caught := true;
  end;
  if not caught then raise exception 'FAIL: cross-organization experimental result write was allowed'; end if;
  caught := false;
  begin
    perform public.record_experiment_result(
      '00000000-0000-0000-0000-0000000000a1',unit_id,'RES-INVALID','growth_assessment',
      '42'::jsonb,'raw','00000000-0000-0000-0000-0000000000c4',fixed_time
    );
  exception when others then
    if sqlerrm='experimental_result_value_must_be_json_object' then caught := true;
    else raise; end if;
  end;
  if not caught then raise exception 'FAIL: non-object experimental result payload was accepted'; end if;
end
$experiment_result$;
reset role;
select 'PASS: structured experimental results, atomic event linkage, idempotency and tenant isolation' as test_result;


-- Recursive lineage read RPC: ancestor, descendant, material provenance,
-- bounded descendant results, and organization isolation.
\i supabase/migrations/20261109143000_add_recursive_culture_lineage_rpc.sql
set role authenticated;
do $lineage$
declare
  parent_id uuid;
  child_id uuid;
  other_org_culture_id uuid;
  row_count integer;
  was_truncated boolean;
  page_one_code text;
  page_two_code text;
  page_three_code text;
  total_descendants bigint;
  has_next_page boolean;
  material_relationship text;
  caught boolean := false;
begin
  select id into parent_id from public.cultures
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and code='PARENT-001';
  select id into child_id from public.cultures
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and code='CHILD-A';
  select id into other_org_culture_id from public.cultures
   where organization_id='00000000-0000-0000-0000-0000000000a2'
     and code='OTHER-ORG-001';

  select count(*) into row_count
    from public.get_culture_lineage('00000000-0000-0000-0000-0000000000a1', child_id)
   where relation='ancestor' and culture_code='PARENT-001';
  if row_count <> 1 then
    raise exception 'FAIL: lineage RPC did not return the biological ancestor';
  end if;

  select count(*) into row_count
    from public.get_culture_lineage('00000000-0000-0000-0000-0000000000a1', parent_id)
   where relation='descendant' and culture_code='CHILD-A';
  if row_count <> 1 then
    raise exception 'FAIL: lineage RPC did not return a biological descendant';
  end if;

  select count(*) into row_count
    from public.get_culture_lineage('00000000-0000-0000-0000-0000000000a1', child_id)
   where relation='material_ancestor' and material_code='MAT-PARENT';
  if row_count <> 1 then
    raise exception 'FAIL: lineage RPC did not return material provenance';
  end if;
  select material_relationship_type into material_relationship
    from public.get_culture_lineage('00000000-0000-0000-0000-0000000000a1', child_id)
   where relation='material_ancestor' and material_code='MAT-PARENT';
  if material_relationship is distinct from 'division_aliquotes' then
    raise exception 'FAIL: material lineage did not expose the typed relationship';
  end if;

  select has_more into was_truncated
    from public.get_culture_lineage('00000000-0000-0000-0000-0000000000a1', parent_id, 1, 0)
   where relation='current';
  if was_truncated is distinct from true then
    raise exception 'FAIL: lineage RPC did not advertise the next descendant page';
  end if;

  select culture_code, descendant_total, has_more
    into page_one_code, total_descendants, has_next_page
    from public.get_culture_lineage(
      '00000000-0000-0000-0000-0000000000a1', parent_id, 1, 0
    )
   where relation='descendant';
  if page_one_code is null or total_descendants <> 3 or has_next_page is distinct from true then
    raise exception 'FAIL: first lineage page metadata is incorrect';
  end if;

  select culture_code
    into page_two_code
    from public.get_culture_lineage(
      '00000000-0000-0000-0000-0000000000a1', parent_id, 1, 1
    )
   where relation='descendant';
  if page_two_code is null or page_two_code = page_one_code then
    raise exception 'FAIL: second lineage page is missing or duplicates page one';
  end if;

  select culture_code
    into page_three_code
    from public.get_culture_lineage(
      '00000000-0000-0000-0000-0000000000a1', parent_id, 1, 2
    )
   where relation='descendant';
  if page_three_code is null or page_three_code in (page_one_code, page_two_code) then
    raise exception 'FAIL: third lineage page is missing or duplicates an earlier page';
  end if;

  select has_more into has_next_page
    from public.get_culture_lineage(
      '00000000-0000-0000-0000-0000000000a1', parent_id, 1, 2
    )
   where relation='current';
  if has_next_page is distinct from false then
    raise exception 'FAIL: final lineage page incorrectly advertises another page';
  end if;

  begin
    perform * from public.get_culture_lineage(
      '00000000-0000-0000-0000-0000000000a2', other_org_culture_id
    );
  exception when insufficient_privilege then
    caught := true;
  end;
  if not caught then
    raise exception 'FAIL: lineage RPC allowed cross-organization reads';
  end if;
end
$lineage$;
reset role;
select 'PASS: recursive lineage ancestors, descendants, material provenance, truncation and tenant isolation' as test_result;


-- Event history must include events attached to the selected culture and the
-- operation event that created it, even though that operation is attached to
-- the parent culture.
-- Tenant-scoped, paginated event history for a biological culture.
-- The creation operation is linked through descendant_created.payload.operation_event_id.
create index if not exists events_org_culture_time_idx
  on public.events(organization_id, culture_id, occurred_at desc, id desc)
  where culture_id is not null;

create index if not exists events_org_material_time_idx
  on public.events(organization_id, material_id, occurred_at desc, id desc)
  where material_id is not null;

drop function if exists public.get_culture_event_history(uuid, uuid, integer, integer);
create function public.get_culture_event_history(
  p_organization_id uuid,
  p_culture_id uuid,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  event_id uuid,
  event_type text,
  occurred_at timestamptz,
  actor_user_id uuid,
  culture_id uuid,
  material_id uuid,
  batch_id uuid,
  source_relation text,
  payload jsonb,
  total_rows bigint,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 1000000));
begin
  if auth.uid() is null or not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.cultures c
     where c.organization_id = p_organization_id
       and c.id = p_culture_id
  ) then
    raise exception 'culture_not_found' using errcode = 'P0002';
  end if;

  return query
  with target as (
    select c.id, c.material_id
      from public.cultures c
     where c.organization_id = p_organization_id
       and c.id = p_culture_id
  ),
  candidates as (
    select e.id, e.event_type, e.occurred_at, e.actor_user_id,
           e.culture_id, e.material_id, e.batch_id, 'culture'::text as source_relation,
           e.payload, 1 as priority
      from target t
      join public.events e
        on e.organization_id = p_organization_id
       and e.culture_id = t.id
    union all
    select e.id, e.event_type, e.occurred_at, e.actor_user_id,
           e.culture_id, e.material_id, e.batch_id, 'material'::text,
           e.payload, 2
      from target t
      join public.events e
        on e.organization_id = p_organization_id
       and e.material_id = t.material_id
    union all
    -- A culture created through create_culture_with_generation records its
    -- own culture_created event. Surface that event in its biological parent's
    -- history as well, even though this path does not emit descendant_created.
    select e.id, e.event_type, e.occurred_at, e.actor_user_id,
           e.culture_id, e.material_id, e.batch_id, 'descendant_culture'::text,
           e.payload, 3
      from target t
      join public.cultures child
        on child.organization_id = p_organization_id
       and child.parent_culture_id = t.id
      join public.events e
        on e.organization_id = p_organization_id
       and e.culture_id = child.id
       and e.event_type = 'culture_created'
    union all
    select operation.id, operation.event_type, operation.occurred_at,
           operation.actor_user_id, operation.culture_id, operation.material_id,
           operation.batch_id, 'creation_operation'::text, operation.payload, 4
      from target t
      join public.events child_event
        on child_event.organization_id = p_organization_id
       and child_event.culture_id = t.id
       and child_event.event_type = 'descendant_created'
      join public.events operation
        on operation.organization_id = p_organization_id
       and operation.id::text = child_event.payload ->> 'operation_event_id'
    union all
    select e.id, e.event_type, e.occurred_at, e.actor_user_id,
           e.culture_id, e.material_id, e.batch_id, 'batch'::text,
           e.payload, 5
      from public.batches b
      join public.events e
        on e.organization_id = p_organization_id
       and e.batch_id = b.id
     where b.organization_id = p_organization_id
       and b.culture_id = p_culture_id
  ),
  unique_events as (
    select distinct on (c.id)
           c.id, c.event_type, c.occurred_at, c.actor_user_id,
           c.culture_id, c.material_id, c.batch_id, c.source_relation, c.payload
      from candidates c
     order by c.id, c.priority
  ),
  ranked as (
    select u.*,
           row_number() over (order by u.occurred_at desc, u.id desc) as row_no
      from unique_events u
  ),
  stats as (
    select count(*)::bigint as total_rows from unique_events
  )
  select r.id, r.event_type, r.occurred_at, r.actor_user_id,
         r.culture_id, r.material_id, r.batch_id, r.source_relation, r.payload,
         stats.total_rows, stats.total_rows > (v_offset + v_limit)
    from ranked r
    cross join stats
   where r.row_no > v_offset
     and r.row_no <= (v_offset + v_limit)
   order by r.occurred_at desc, r.id desc;
end;
$function$;

revoke all on function public.get_culture_event_history(uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_culture_event_history(uuid, uuid, integer, integer)
  to authenticated;
set role authenticated;
do $culture_history$
declare
  child_id uuid;
  operation_count integer;
  descendant_count integer;
  total_count bigint;
  has_more_flag boolean;
  first_event uuid;
  second_event uuid;
  caught boolean := false;
begin
  select id into child_id from public.cultures
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and code='CHILD-A';

  -- The legacy/manual culture-generation RPC writes culture_created on the
  -- child, but does not write descendant_created or link the event to parent.
  -- Parent history must still expose that creation event.
  insert into public.materials(
    organization_id, material_code, material_type, parent_material_id,
    state, generation, metadata
  )
  select '00000000-0000-0000-0000-0000000000a1', 'MAT-HISTORY-DIRECT-CHILD',
         'culture_derived', material_id, 'active', 2,
         '{"generation_method":"culture_propagation"}'::jsonb
    from public.cultures
   where organization_id='00000000-0000-0000-0000-0000000000a1'
     and code='PARENT-001';
  insert into public.cultures(
    organization_id, code, culture_type, material_id, parent_culture_id
  )
  select '00000000-0000-0000-0000-0000000000a1', 'HISTORY-DIRECT-CHILD',
         p.culture_type, m.id, p.id
    from public.cultures p
    join public.materials m
      on m.organization_id=p.organization_id
     and m.material_code='MAT-HISTORY-DIRECT-CHILD'
   where p.organization_id='00000000-0000-0000-0000-0000000000a1'
     and p.code='PARENT-001';
  insert into public.events(
    organization_id, event_type, occurred_at, culture_id, payload
  )
  select c.organization_id, 'culture_created', now(), c.id,
         '{"generation":2,"creation_path":"create_culture_with_generation"}'::jsonb
    from public.cultures c
   where c.organization_id='00000000-0000-0000-0000-0000000000a1'
     and c.code='HISTORY-DIRECT-CHILD';

  if (select count(*) from public.get_culture_event_history(
        '00000000-0000-0000-0000-0000000000a1',
        (select id from public.cultures where organization_id='00000000-0000-0000-0000-0000000000a1' and code='PARENT-001'),
        100, 0
      ) where source_relation='descendant_culture'
          and event_type='culture_created') <> 1 then
    raise exception 'FAIL: parent history omitted a directly generated child culture event';
  end if;

  insert into public.batches(organization_id, culture_id)
  values ('00000000-0000-0000-0000-0000000000a1', child_id);
  insert into public.events(organization_id, event_type, occurred_at, sample_id, batch_id, payload)
  select '00000000-0000-0000-0000-0000000000a1', 'batch_started', now(),
         gen_random_uuid(), b.id, '{"stage":"inoculation"}'::jsonb
    from public.batches b
   where b.organization_id='00000000-0000-0000-0000-0000000000a1'
     and b.culture_id=child_id;

  select count(*) into operation_count
    from public.get_culture_event_history(
      '00000000-0000-0000-0000-0000000000a1', child_id, 100, 0
    )
   where source_relation='creation_operation'
     and event_type='division_aliquotes';
  if operation_count <> 1 then
    raise exception 'FAIL: culture history omitted the operation event that created this culture';
  end if;

  select count(*) into descendant_count
    from public.get_culture_event_history(
      '00000000-0000-0000-0000-0000000000a1', child_id, 100, 0
    )
   where source_relation='culture'
     and event_type='descendant_created';
  if descendant_count <> 1 then
    raise exception 'FAIL: culture history omitted its own descendant-created event';
  end if;

  select count(*) into descendant_count
    from public.get_culture_event_history(
      '00000000-0000-0000-0000-0000000000a1', child_id, 100, 0
    )
   where source_relation='batch' and event_type='batch_started';
  if descendant_count <> 1 then
    raise exception 'FAIL: culture history omitted an event from a linked production batch';
  end if;

  select h.total_rows, h.has_more into total_count, has_more_flag
    from public.get_culture_event_history(
      '00000000-0000-0000-0000-0000000000a1', child_id, 1, 0
    ) h limit 1;
  if total_count < 2 or has_more_flag is distinct from true then
    raise exception 'FAIL: event history pagination metadata is incorrect';
  end if;

  select event_id into first_event
    from public.get_culture_event_history(
      '00000000-0000-0000-0000-0000000000a1', child_id, 1, 0
    ) limit 1;
  select event_id into second_event
    from public.get_culture_event_history(
      '00000000-0000-0000-0000-0000000000a1', child_id, 1, 1
    ) limit 1;
  if first_event is null or second_event is null or first_event=second_event then
    raise exception 'FAIL: event history pages are missing or duplicate an event';
  end if;

  begin
    perform * from public.get_culture_event_history(
      '00000000-0000-0000-0000-0000000000a2',
      (select id from public.cultures where organization_id='00000000-0000-0000-0000-0000000000a2' and code='OTHER-ORG-001'),
      100, 0
    );
  exception when insufficient_privilege then caught := true;
  end;
  if not caught then
    raise exception 'FAIL: culture event history allowed cross-organization reads';
  end if;
end
$culture_history$;
reset role;
select 'PASS: culture event history includes source operation, culture events, pagination and tenant isolation' as test_result;
