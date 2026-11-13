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
  bie_result_id uuid;
  bie_completed_at timestamptz;
  tampered_payload jsonb;
  qc_result_id uuid;
  got uuid;
  claimed_count integer;
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
       'contract','BA-LABS/UPSTREAM-ENGINE-ARTIFACT',
       'contract_version','1.0.0',
       'role','environmental_qc',
       'execution_id',qc_id::text,
       'result_id',qc_result_id::text,
       'request_id','11111111-1111-4111-8111-111111111111',
       'completed_at',ts::text,
       'scope',jsonb_build_object(
         'organization_id',org_id::text,
         'location_id','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
         'window_start','2026-11-12T00:00:00Z',
         'window_end','2026-11-13T00:00:00Z'
       ),
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

 -- A dispatcher claim must observe the BIE row and its immutable QC edge
 -- together; no worker may claim the downstream execution before lineage exists.
 select count(*) into claimed_count
 from public.claim_engine_executions(
   'bie-dispatch-fixture-worker', 1, 120, atomic_execution_id, org_id
 );
 if claimed_count <> 1 then
   raise exception 'atomically enqueued BIE execution was not claimable by dispatcher';
 end if;
 if not exists(
   select 1
   from public.engine_executions e
   join public.engine_execution_dependencies d
     on d.organization_id=e.organization_id
    and d.downstream_execution_id=e.id
   where e.organization_id=org_id
     and e.id=atomic_execution_id
     and e.status='running'
     and e.claimed_by='bie-dispatch-fixture-worker'
     and d.upstream_execution_id=qc_id
     and d.upstream_result_id=qc_result_id
     and d.dependency_role='environmental_qc'
 ) then
   raise exception 'dispatcher claim did not retain the exact QC lineage edge';
 end if;

 -- Complete the claimed BIE execution through the same lease-owned RPC used
 -- by the queue dispatcher, then verify its QC assessment and lineage survive
 -- in the immutable, queryable result ledger.
 bie_completed_at := clock_timestamp();
 bie_result_id := public.complete_claimed_engine_execution(
   org_id,
   atomic_execution_id,
   jsonb_build_object(
     'contract','BA-LABS/ENGINE-RESULT',
     'contract_version','1.0.0',
     'request_id','33333333-3333-4333-8333-333333333333',
     'execution_id',atomic_execution_id::text,
     'engine',jsonb_build_object(
       'engine_id','biological.context.features',
       'engine_version','0.2.0'
     ),
     'input_snapshot_sha256',repeat('c',64),
     'status','completed',
     'result',jsonb_build_object(
       'outcome','review_required',
       'value',jsonb_build_object(
         'features',jsonb_build_object('environmental_observation_count',0),
         'environmental_quality_control',jsonb_build_object(
           'outcome','success',
           'value',jsonb_build_object('series',jsonb_build_array()),
           'limitations',jsonb_build_array(),
           'quality_flags',jsonb_build_array('qc_review_signal'),
           'provenance',jsonb_build_object('algorithm','fixture')
         )
       ),
       'limitations',jsonb_build_array('fixture_limitation'),
       'quality_flags',jsonb_build_array('environmental_qc_review_required'),
       'provenance',jsonb_build_object(
         'upstream_artifacts',jsonb_build_array(jsonb_build_object(
           'role','environmental_qc',
           'execution_id',qc_id::text,
           'result_id',qc_result_id::text,
           'artifact_sha256',repeat('f',64)
         ))
       )
     )
   ),
   bie_completed_at,
   'bie-dispatch-fixture-worker'
 );

 if not exists(
   select 1
   from public.engine_execution_results r
   join public.engine_executions e
     on e.organization_id=r.organization_id and e.id=r.execution_id
   join public.engine_execution_dependencies d
     on d.organization_id=r.organization_id and d.downstream_execution_id=r.execution_id
   where r.organization_id=org_id
     and r.id=bie_result_id
     and r.execution_id=atomic_execution_id
     and r.engine_id='biological.context.features'
     and r.engine_version='0.2.0'
     and r.outcome='review_required'
     and r.value->'environmental_quality_control'->'quality_flags'
       = '["qc_review_signal"]'::jsonb
     and r.quality_flags='["environmental_qc_review_required"]'::jsonb
     and r.provenance->'upstream_artifacts'->0->>'execution_id'=qc_id::text
     and r.provenance->'upstream_artifacts'->0->>'result_id'=qc_result_id::text
     and e.status='completed'
     and e.result_payload->'result'->'provenance'->'upstream_artifacts'->0->>'artifact_sha256'=repeat('f',64)
     and d.upstream_execution_id=qc_id
     and d.upstream_result_id=qc_result_id
     and d.dependency_role='environmental_qc'
 ) then
   raise exception 'completed BIE result did not persist QC assessment and exact upstream lineage';
 end if;

 -- The enqueue boundary must reject a caller-modified QC result even when
 -- execution/result IDs and all other lineage metadata still point upstream.
 select request_payload into tampered_payload
 from public.engine_executions
 where organization_id=org_id and id=atomic_execution_id;

 tampered_payload := jsonb_set(
   tampered_payload,
   '{upstream_artifacts,0,result,outcome}',
   '"failed"'::jsonb,
   false
 );
 tampered_payload := jsonb_set(tampered_payload, '{request_id}',
   '"44444444-4444-4444-8444-444444444444"'::jsonb, false);
 tampered_payload := jsonb_set(tampered_payload, '{input,snapshot_sha256}',
   to_jsonb(repeat('d',64)), false);
 begin
   perform public.enqueue_bie_with_environmental_qc(
     org_id,
     '44444444-4444-4444-8444-444444444444',
     'bie-tampered-artifact',
     qc_scope || jsonb_build_object('culture_id','99999999-9999-4999-8999-999999999999'),
     '{}'::uuid[],
     repeat('d',64),
     tampered_payload,
     user_id,
     qc_id
   );
   raise exception 'tampered upstream QC result was accepted' using errcode='P0001';
 exception when sqlstate '22023' then
   null;
 end;

 -- A different upstream engine version must not be accepted by the fixed
 -- QC v0.2 -> BIE v0.2 composition edge.
 tampered_payload := jsonb_set(
   (select request_payload from public.engine_executions
    where organization_id=org_id and id=atomic_execution_id),
   '{upstream_artifacts,0,engine_version}',
   '"9.9.9"'::jsonb,
   false
 );
 tampered_payload := jsonb_set(tampered_payload, '{request_id}',
   '"55555555-5555-4555-8555-555555555555"'::jsonb, false);
 tampered_payload := jsonb_set(tampered_payload, '{input,snapshot_sha256}',
   to_jsonb(repeat('e',64)), false);
 begin
   perform public.enqueue_bie_with_environmental_qc(
     org_id,
     '55555555-5555-4555-8555-555555555555',
     'bie-wrong-upstream-version',
     qc_scope || jsonb_build_object('culture_id','99999999-9999-4999-8999-999999999999'),
     '{}'::uuid[],
     repeat('e',64),
     tampered_payload,
     user_id,
     qc_id
   );
   raise exception 'incompatible upstream QC version was accepted' using errcode='P0001';
 exception when sqlstate '22023' then
   null;
 end;
 
 -- Cross-tenant attachment must fail even when the caller knows the upstream
 -- execution UUID. The result lookup is scoped by organization_id.
 declare
   other_org_id uuid := 'abababab-abab-4bab-8bab-abababababab';
 begin
   insert into public.organizations(id,code,name)
   values(other_org_id,'TEST-OTHER-TENANT','Other Tenant') on conflict do nothing;
   tampered_payload := (
     select request_payload from public.engine_executions
     where organization_id=org_id and id=atomic_execution_id
   );
   tampered_payload := jsonb_set(tampered_payload,'{request_id}',
     '"66666666-6666-4666-8666-666666666666"'::jsonb,false);
   tampered_payload := jsonb_set(tampered_payload,'{scope,organization_id}',
     to_jsonb(other_org_id::text),false);
   begin
     perform public.enqueue_bie_with_environmental_qc(
       other_org_id,
       '66666666-6666-4666-8666-666666666666',
       'bie-cross-tenant-artifact',
       jsonb_set(qc_scope || jsonb_build_object('culture_id','99999999-9999-4999-8999-999999999999'),
         '{organization_id}',to_jsonb(other_org_id::text),false),
       '{}'::uuid[],
       repeat('6',64),
       jsonb_set(tampered_payload,'{input,snapshot_sha256}',to_jsonb(repeat('6',64)),false),
       user_id,
       qc_id
     );
     raise exception 'cross-tenant upstream QC execution was accepted' using errcode='P0001';
   exception when sqlstate '22023' then
     null;
   end;
 end;

 -- Exact location and time-window identity are part of the QC -> BIE edge.
 tampered_payload := (
   select request_payload from public.engine_executions
   where organization_id=org_id and id=atomic_execution_id
 );
 tampered_payload := jsonb_set(tampered_payload,'{request_id}',
   '"77777777-7777-4777-8777-777777777777"'::jsonb,false);
 tampered_payload := jsonb_set(tampered_payload,'{scope,location_id}',
   '"ffffffff-ffff-4fff-8fff-ffffffffffff"'::jsonb,false);
 tampered_payload := jsonb_set(tampered_payload,'{input,snapshot_sha256}',
   to_jsonb(repeat('7',64)),false);
 begin
   perform public.enqueue_bie_with_environmental_qc(
     org_id,
     '77777777-7777-4777-8777-777777777777',
     'bie-location-mismatch',
     jsonb_set(qc_scope || jsonb_build_object('culture_id','99999999-9999-4999-8999-999999999999'),
       '{location_id}','"ffffffff-ffff-4fff-8fff-ffffffffffff"'::jsonb,false),
     '{}'::uuid[],
     repeat('7',64),
     tampered_payload,
     user_id,
     qc_id
   );
   raise exception 'QC artifact from another location was accepted' using errcode='P0001';
 exception when sqlstate '22023' then
   null;
 end;

 tampered_payload := (
   select request_payload from public.engine_executions
   where organization_id=org_id and id=atomic_execution_id
 );
 tampered_payload := jsonb_set(tampered_payload,'{request_id}',
   '"88888888-8888-4888-8888-888888888888"'::jsonb,false);
 tampered_payload := jsonb_set(tampered_payload,'{parameters,window_start}',
   '"2026-11-11T00:00:00Z"'::jsonb,false);
 tampered_payload := jsonb_set(tampered_payload,'{input,snapshot_sha256}',
   to_jsonb(repeat('8',64)),false);
 begin
   perform public.enqueue_bie_with_environmental_qc(
     org_id,
     '88888888-8888-4888-8888-888888888888',
     'bie-window-mismatch',
     qc_scope || jsonb_build_object('culture_id','99999999-9999-4999-8999-999999999999'),
     '{}'::uuid[],
     repeat('8',64),
     tampered_payload,
     user_id,
     qc_id
   );
   raise exception 'QC artifact from another analysis window was accepted' using errcode='P0001';
 exception when sqlstate '22023' then
   null;
 end;

end $$;
rollback;
