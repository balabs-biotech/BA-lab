\set ON_ERROR_STOP on
begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists private;
create table if not exists auth.users(id uuid primary key);
create table if not exists public.organizations(id uuid primary key);
create table if not exists public.organization_members(organization_id uuid,user_id uuid,role text,primary key(organization_id,user_id));
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create or replace function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid())
$$;

drop table if exists public.engine_execution_dependencies cascade;
drop table if exists public.engine_execution_results cascade;
drop table if exists public.engine_executions cascade;
\ir ../migrations/20261112020000_create_engine_executions.sql
\ir ../migrations/20261112030000_create_engine_execution_results.sql
\ir ../migrations/20261113140000_recover_expired_engine_execution_leases.sql
\ir ../migrations/20261113150000_add_atomic_engine_queue_claims.sql
\ir ../migrations/20261113165000_complete_claimed_engine_execution.sql
\ir ../migrations/20261113180000_fail_claimed_engine_execution.sql
\ir ../migrations/20261113200000_add_engine_execution_dependencies.sql
\ir ../migrations/20261113210000_enqueue_bie_with_environmental_qc.sql

do $$
declare
  org_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  user_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  qc_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  bie_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  atomic_execution_id uuid;
  atomic_result_id uuid;
  qc_result_id uuid;
  got uuid;
  ts timestamptz;
  qc_scope jsonb := '{"organization_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","location_id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}';
  params jsonb := '{"window_start":"2026-11-12T00:00:00Z","window_end":"2026-11-13T00:00:00Z"}';
begin
 insert into public.organizations(id,code,name)
 values(org_id,'TEST-ENGINE-LINEAGE','Engine Lineage Test') on conflict do nothing;
 insert into auth.users(id) values(user_id) on conflict do nothing;
 insert into public.organization_members values(org_id,user_id,'member') on conflict do nothing;

 insert into public.engine_executions(organization_id,id,request_id,idempotency_key,engine_id,engine_version,scope,input_record_ids,input_snapshot_sha256,request_payload,status)
 values(org_id,qc_id,'11111111-1111-4111-8111-111111111111','qc-dependency-fixture','environmental.timeseries.qc','0.2.0',qc_scope,'{}',repeat('a',64),
 jsonb_build_object('parameters',params),'queued');
 perform public.claim_engine_executions('lineage-fixture-worker',1,120,qc_id,org_id);
 ts := clock_timestamp();
 qc_result_id := public.complete_claimed_engine_execution(
   org_id,qc_id,
   jsonb_build_object(
     'contract','BA-LABS/ENGINE-RESULT','contract_version','1.0.0',
     'request_id','11111111-1111-4111-8111-111111111111','execution_id',qc_id::text,
     'engine',jsonb_build_object('engine_id','environmental.timeseries.qc','engine_version','0.2.0'),
     'input_snapshot_sha256',repeat('a',64),'status','completed',
     'result',jsonb_build_object('outcome','success','value',jsonb_build_object('series',jsonb_build_array()),
       'limitations',jsonb_build_array(),'quality_flags',jsonb_build_array(),
       'provenance',jsonb_build_object('algorithm','fixture'))
   ),ts,'lineage-fixture-worker'
 );

 insert into public.engine_executions(organization_id,id,request_id,idempotency_key,engine_id,engine_version,scope,input_record_ids,input_snapshot_sha256,request_payload,status)
 values(org_id,bie_id,'22222222-2222-4222-8222-222222222222','bie-dependency-fixture','biological.context.features','0.2.0',qc_scope,'{}',repeat('b',64),
 jsonb_build_object('parameters',params),'queued');

 got := public.attach_environmental_qc_dependency(org_id,bie_id,qc_id);
 if got <> qc_result_id then raise exception 'dependency must bind exact immutable upstream result row'; end if;
 if not exists(select 1 from public.engine_execution_dependencies where organization_id=org_id and downstream_execution_id=bie_id and upstream_execution_id=qc_id and upstream_result_id=qc_result_id and dependency_role='environmental_qc') then
   raise exception 'dependency edge was not persisted';
 end if;

 begin
   perform public.attach_environmental_qc_dependency(org_id,bie_id,qc_id);
   raise exception 'duplicate dependency edge accepted';
 exception when unique_violation then null;
 end;
 begin
   update public.engine_execution_dependencies set dependency_role='tampered' where organization_id=org_id and downstream_execution_id=bie_id;
   raise exception 'dependency edge mutation accepted';
 exception when sqlstate '55000' then null;
 end;
 
 if has_function_privilege('authenticated','public.attach_environmental_qc_dependency(uuid,uuid,uuid)','EXECUTE')
   or not has_function_privilege('service_role','public.attach_environmental_qc_dependency(uuid,uuid,uuid)','EXECUTE') then
   raise exception 'dependency RPC must be service-role only';
 end if;
 if has_table_privilege('authenticated','public.engine_execution_dependencies','INSERT')
   or has_table_privilege('authenticated','public.engine_execution_dependencies','UPDATE')
   or has_table_privilege('authenticated','public.engine_execution_dependencies','DELETE') then
   raise exception 'authenticated clients must not mutate dependency edges';
 end if;

 select enqueued.execution_id, enqueued.upstream_result_id
 into atomic_execution_id, atomic_result_id
 from public.enqueue_bie_with_environmental_qc(
   org_id,
   '33333333-3333-4333-8333-333333333333',
   'bie-atomic-fixture',
   qc_scope || jsonb_build_object('culture_id','99999999-9999-4999-8999-999999999999'),
   '{}'::uuid[],
   repeat('c',64),
   jsonb_build_object(
     'contract','BA-LABS/ENGINE','contract_version','1.0.0',
     'request_id','33333333-3333-4333-8333-333333333333',
     'engine',jsonb_build_object('engine_id','biological.context.features','engine_version','0.2.0'),
     'scope',qc_scope || jsonb_build_object('culture_id','99999999-9999-4999-8999-999999999999'),
     'input',jsonb_build_object('record_ids','[]'::jsonb,'snapshot_sha256',repeat('c',64),'records','[]'::jsonb),
     'parameters',jsonb_build_object(
       'window_start','2026-11-12T00:00:00Z','window_end','2026-11-13T00:00:00Z',
       'timezone','Africa/Algiers'
     ),
     'upstream_artifacts',jsonb_build_array(jsonb_build_object(
       'role','environmental_qc',
       'execution_id',qc_id::text,
       'result_id',qc_result_id::text,
       'engine_id','environmental.timeseries.qc',
       'engine_version','0.2.0',
       'input_snapshot_sha256',repeat('a',64),
       'result',jsonb_build_object(
         'outcome','success',
         'value',jsonb_build_object('series',jsonb_build_array()),
         'limitations',jsonb_build_array(),
         'quality_flags',jsonb_build_array(),
         'provenance',jsonb_build_object('algorithm','fixture')
       ),
       'artifact_sha256',repeat('f',64)
     ))
   ),
   user_id,
   qc_id
 ) as enqueued;

 if atomic_result_id <> qc_result_id then
   raise exception 'atomic enqueue must bind the exact upstream result';
 end if;
 if not exists(
   select 1 from public.engine_execution_dependencies
   where organization_id=org_id
     and downstream_execution_id=atomic_execution_id
     and upstream_execution_id=qc_id
     and upstream_result_id=qc_result_id
     and dependency_role='environmental_qc'
 ) then
   raise exception 'atomic enqueue did not persist dependency edge';
 end if;
end $$;
rollback;
