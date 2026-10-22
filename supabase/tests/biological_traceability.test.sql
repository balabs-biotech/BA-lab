-- Runtime regression tests for biological traceability RPC.
-- Runs only in disposable CI PostgreSQL 17; never run against production.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
end $$;
create schema if not exists auth;
create schema if not exists private;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.organizations(id uuid primary key);
create table public.organization_members(organization_id uuid not null, user_id uuid not null, primary key(organization_id,user_id));
create or replace function private.is_org_member(p_org uuid) returns boolean
  language sql stable security definer set search_path = pg_catalog, public
  as $$ select exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=auth.uid()) $$;
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
create table public.events(
  organization_id uuid not null references public.organizations(id), id uuid not null default gen_random_uuid(), event_type text not null,
  occurred_at timestamptz not null, actor_user_id uuid references auth.users(id), culture_id uuid, material_id uuid,
  sample_id uuid, experimental_unit_id uuid, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
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
grant select,insert,update,delete on public.material_types,public.culture_types,public.organizations,public.strains,public.materials,public.cultures,public.material_relationships,public.events to authenticated,anon;
alter table public.materials enable row level security;
alter table public.cultures enable row level security;
alter table public.material_relationships enable row level security;
alter table public.events enable row level security;
create policy materials_org on public.materials to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create policy cultures_org on public.cultures to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create policy relationships_org on public.material_relationships to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
create policy events_org on public.events to authenticated using(private.is_org_member(organization_id)) with check(private.is_org_member(organization_id));
\i supabase/migrations/20261022021957_biological_traceability_v1.sql
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
set role authenticated;
do $$
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
end $$;
reset role;
select 'PASS: biological traceability runtime, lineage, RLS boundary, input validation and grants' as test_result;