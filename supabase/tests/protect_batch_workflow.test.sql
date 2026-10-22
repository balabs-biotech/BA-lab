-- Regression test for 20261021090000_protect_batch_workflow_v1.sql.
-- Minimal Supabase-like fixture. Runs only in disposable CI PostgreSQL 17.
\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create schema if not exists private;
grant usage on schema auth, private, public to authenticated, anon, service_role;
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

drop table if exists public.batch_qc_checks cascade;
drop table if exists public.batch_qc_templates cascade;
drop table if exists public.batch_stages cascade;
drop table if exists public.events cascade;
drop table if exists public.batches cascade;
create table if not exists public.organization_members(organization_id uuid, user_id uuid);
create or replace function private.is_org_member(p_org uuid) returns boolean
  language sql stable security definer set search_path = pg_catalog, public
  as $$ select exists (select 1 from public.organization_members om
                       where om.organization_id = p_org and om.user_id = auth.uid()) $$;

create table public.batches(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, batch_code text not null, name text not null,
  batch_type text not null, protocol_version_id uuid, material_id uuid, culture_id uuid,
  location_id uuid, environment_id uuid, planned_at timestamptz, quantity_planned numeric,
  quantity_unit_code text, current_stage text not null, status text not null,
  started_at timestamptz, completed_at timestamptz);
create table public.batch_stages(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, batch_id uuid not null,
  stage_code text not null, sequence_no integer not null, status text not null,
  started_at timestamptz, completed_at timestamptz);
create table public.batch_qc_checks(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, batch_id uuid not null,
  check_code text not null, label text not null, status text not null,
  unit_code text, measured_value numeric, value_text text, checked_by uuid, checked_at timestamptz);
create table public.batch_qc_templates(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  batch_type text not null, check_code text not null, label text not null,
  default_unit_code text, required boolean not null default true, sequence_no integer not null default 1);
create table public.locations(
  id uuid primary key, organization_id uuid not null, name text not null);
create table public.environments(
  id uuid primary key, organization_id uuid not null, location_id uuid, name text not null);
create table public.events(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  event_type text not null, occurred_at timestamptz not null, actor_user_id uuid,
  culture_id uuid, material_id uuid, location_id uuid, environment_id uuid,
  batch_id uuid, payload jsonb);

grant select, insert, update, delete on public.organization_members, public.batches,
  public.batch_stages, public.batch_qc_checks, public.batch_qc_templates, public.events
  to authenticated, anon, service_role;
insert into public.organization_members values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1');
insert into public.batch_qc_templates(organization_id,batch_type,check_code,label,default_unit_code)
values ('00000000-0000-0000-0000-0000000000a1','test','appearance','Appearance',null);

\i supabase/migrations/20261021090000_protect_batch_workflow_v1.sql
\i supabase/migrations/20261021090000_protect_batch_workflow_v1.sql
\i supabase/migrations/20261022100000_add_atomic_batch_movement_rpc.sql

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
set role authenticated;

-- RPC creates the batch/stages/QC rows and remains usable by an authorized member.
do $$ declare b public.batches; n integer; begin
  select * into b from public.create_batch_with_stages(
    '00000000-0000-0000-0000-0000000000a1','TEST-1','Workflow test','test');
  if b.status <> 'planned' then raise exception 'FAIL: new batch status is not planned'; end if;
  select count(*) into n from public.batch_stages where batch_id=b.id;
  if n <> 10 then raise exception 'FAIL: expected 10 stages, got %', n; end if;
  select count(*) into n from public.batch_qc_checks where batch_id=b.id;
  if n <> 1 then raise exception 'FAIL: expected required QC template to be copied'; end if;

  begin update public.batches set status='released' where id=b.id;
    raise exception 'FAIL: direct batch status update was allowed';
  exception when sqlstate '42501' then null; end;

  begin update public.batch_stages set status='completed' where batch_id=b.id and stage_code='preparation';
    raise exception 'FAIL: direct stage update was allowed';
  exception when sqlstate '42501' then null; end;

  -- Forge only audit metadata; trigger must preserve server-owned values.
  update public.batch_qc_checks set checked_by='00000000-0000-0000-0000-0000000000ff',
    checked_at='2000-01-01T00:00:00Z' where batch_id=b.id;
  if exists (select 1 from public.batch_qc_checks where batch_id=b.id
    and (checked_by is not null or checked_at is not null)) then
    raise exception 'FAIL: checked_by/checked_at can be forged without changing the result';
  end if;

  -- A result change stamps actor/time server-side.
  update public.batch_qc_checks set status='pass', measured_value=1 where batch_id=b.id;
  if not exists (select 1 from public.batch_qc_checks where batch_id=b.id
    and status='pass' and checked_by=auth.uid() and checked_at is not null) then
    raise exception 'FAIL: QC result was not stamped with server actor/time';
  end if;
end $$;
reset role;

-- Closed batches cannot be advanced, even through the RPC.
update public.batches set status='released', current_stage='release'
where batch_code='TEST-1';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
set role authenticated;
do $$ begin
  begin perform * from public.advance_batch_stage(
    (select id from public.batches where batch_code='TEST-1'),'release');
    raise exception 'FAIL: closed batch was advanced';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;
reset role;


-- Movement updates the batch and writes a server-attributed history event atomically.
update public.batches set status='planned', current_stage='preparation' where batch_code='TEST-1';
insert into public.locations(id,organization_id,name) values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','Room A'),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1','Room B');
insert into public.environments(id,organization_id,location_id,name) values
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000c2','Incubator B');
update public.batches set material_id='00000000-0000-0000-0000-0000000000e1'
where batch_code='TEST-1';

insert into public.batches(
  id,organization_id,batch_code,name,batch_type,material_id,current_stage,status
) values (
  '00000000-0000-0000-0000-0000000000f2',
  '00000000-0000-0000-0000-0000000000a1',
  'CLOSED-1','Closed batch','test',
  '00000000-0000-0000-0000-0000000000e3',
  'release','released'
);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
set role authenticated;
do $ declare v_result jsonb; v_batch_id uuid; v_closed_batch_id uuid; begin
  select id into v_batch_id from public.batches where batch_code='TEST-1';
  select id into v_closed_batch_id from public.batches where batch_code='CLOSED-1';
  v_result := public.move_batch_to_location(
    v_batch_id,
    '00000000-0000-0000-0000-0000000000c2',
    '00000000-0000-0000-0000-0000000000d1',
    'Moved for incubation'
  );
  if not exists (
    select 1 from public.batches
    where id=v_batch_id
      and location_id='00000000-0000-0000-0000-0000000000c2'
      and environment_id='00000000-0000-0000-0000-0000000000d1'
  ) then raise exception 'FAIL: batch location/environment were not updated'; end if;
  if not exists (
    select 1 from public.events
    where id=(v_result->>'event_id')::uuid
      and event_type='batch_moved'
      and batch_id=v_batch_id
      and material_id='00000000-0000-0000-0000-0000000000e1'
      and actor_user_id=auth.uid()
      and payload->>'note'='Moved for incubation'
  ) then raise exception 'FAIL: movement audit event missing or incomplete'; end if;

  begin
    perform public.move_batch_to_location(v_closed_batch_id, null, null, 'closed batch');
    raise exception 'FAIL: closed batch movement was allowed';
  exception when sqlstate '23514' then
    if sqlerrm = 'FAIL: closed batch movement was allowed' then raise; end if;
  end;

  begin
    perform public.move_batch_to_location(
      v_batch_id,
      '00000000-0000-0000-0000-0000000000c1',
      '00000000-0000-0000-0000-0000000000d1',
      null
    );
    raise exception 'FAIL: environment from another location was accepted';
  exception when sqlstate '23503' then null; end;
end $$;
reset role;

-- A member of organization A cannot move a batch owned by organization B.
insert into public.batches(
  id,organization_id,batch_code,name,batch_type,material_id,current_stage,status
) values (
  '00000000-0000-0000-0000-0000000000f1',
  '00000000-0000-0000-0000-0000000000a2',
  'FOREIGN-1','Foreign batch','test',
  '00000000-0000-0000-0000-0000000000e2',
  'preparation','planned'
);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
set role authenticated;
do $$ begin
  begin
    perform public.move_batch_to_location(
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-0000000000c1',
      null,
      'should be denied'
    );
    raise exception 'FAIL: cross-organization batch movement was allowed';
  exception when sqlstate '42501' then
    if sqlerrm = 'FAIL: cross-organization batch movement was allowed' then raise; end if;
  end;
end $$;
reset role;
