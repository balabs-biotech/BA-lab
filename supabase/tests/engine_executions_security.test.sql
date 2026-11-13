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
create table if not exists public.organization_members(
  organization_id uuid not null,
  user_id uuid not null,
  role text not null default 'member',
  primary key(organization_id,user_id)
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id=p_org and om.user_id=auth.uid()
  )
$$;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;

drop table if exists public.engine_executions cascade;
\ir ../migrations/20261112020000_create_engine_executions.sql

do $$
declare
  v_org uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_user uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
begin
  if not (select relrowsecurity from pg_class where oid='public.engine_executions'::regclass) then
    raise exception 'engine_executions must have RLS enabled';
  end if;
  if not has_table_privilege('authenticated','public.engine_executions','SELECT') then
    raise exception 'authenticated members need SELECT privilege';
  end if;
  if has_table_privilege('authenticated','public.engine_executions','INSERT') or
     has_table_privilege('authenticated','public.engine_executions','UPDATE') or
     has_table_privilege('authenticated','public.engine_executions','DELETE') then
    raise exception 'authenticated clients must not write execution ledger rows';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='engine_executions'
      and policyname='engine_executions_select'
      and qual like '%is_org_member%'
  ) then
    raise exception 'tenant membership SELECT policy missing';
  end if;
  insert into public.organizations(id,code,name) values(v_org,'TEST-ENGINE-ORG','Engine Test Organization') on conflict do nothing;
  insert into auth.users(id) values(v_user) on conflict do nothing;
  insert into public.organization_members(organization_id,user_id,role)
    values(v_org,v_user,'member') on conflict do nothing;
  insert into public.engine_executions(
    organization_id,request_id,idempotency_key,engine_id,engine_version,scope,
    input_record_ids,input_snapshot_sha256,request_payload,status,requested_by
  ) values (
    v_org,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','test-idempotency-0001',
    'environmental.timeseries.qc','0.1.0','{"organization_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',
    array['dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid],repeat('a',64),'{}','queued',v_user
  );
  if not exists (
    select 1 from public.engine_executions
    where organization_id=v_org and idempotency_key='test-idempotency-0001'
      and status='queued'
  ) then raise exception 'queued execution could not be persisted'; end if;
  update public.engine_executions
    set status='running', started_at=now(), updated_at=now()
    where organization_id=v_org and idempotency_key='test-idempotency-0001';
  update public.engine_executions
    set status='completed', result_payload='{"outcome":"success"}',
        completed_at=now(), updated_at=now()
    where organization_id=v_org and idempotency_key='test-idempotency-0001';
  begin
    update public.engine_executions
      set input_snapshot_sha256=repeat('c',64)
      where organization_id=v_org and idempotency_key='test-idempotency-0001';
    raise exception 'immutable input snapshot was modified';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.engine_executions
      set status='failed', error_code='late_failure'
      where organization_id=v_org and idempotency_key='test-idempotency-0001';
    raise exception 'terminal execution was modified';
  exception when sqlstate '55000' then null;
  end;
  begin
    insert into public.engine_executions(
      organization_id,request_id,idempotency_key,engine_id,engine_version,scope,
      input_record_ids,input_snapshot_sha256,request_payload
    ) values (
      v_org,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','test-idempotency-0001',
      'environmental.timeseries.qc','0.1.0','{}',
      array['ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid],repeat('b',64),'{}'
    );
    raise exception 'duplicate organization idempotency key was accepted';
  exception when unique_violation then null;
  end;
  if not (select relrowsecurity from pg_class where oid='public.engine_execution_results'::regclass) then
    raise exception 'engine_execution_results must have RLS enabled';
  end if;
  if not has_table_privilege('authenticated','public.engine_execution_results','SELECT')
    or has_table_privilege('authenticated','public.engine_execution_results','INSERT')
    or has_table_privilege('authenticated','public.engine_execution_results','UPDATE')
    or has_table_privilege('authenticated','public.engine_execution_results','DELETE') then
    raise exception 'engine result rows must be read-only to authenticated members';
  end if;
  if not has_function_privilege('service_role','public.complete_engine_execution(uuid,uuid,jsonb,timestamptz)','EXECUTE')
    or has_function_privilege('authenticated','public.complete_engine_execution(uuid,uuid,jsonb,timestamptz)','EXECUTE') then
    raise exception 'atomic completion RPC must be service-role only';
  end if;

  -- A completed analytical result is normalized into its own immutable,
  -- queryable row and the execution ledger transitions atomically.
  insert into public.engine_executions(
    organization_id,request_id,idempotency_key,engine_id,engine_version,scope,
    input_record_ids,input_snapshot_sha256,request_payload,status,requested_by
  ) values (
    v_org,'11111111-1111-4111-8111-111111111111','test-result-0001',
    'environmental.timeseries.qc','0.1.0',
    '{"organization_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',
    array['22222222-2222-4222-8222-222222222222'::uuid],repeat('d',64),'{}','queued',v_user
  );
  update public.engine_executions
    set status='running', started_at=now(), updated_at=now()
    where organization_id=v_org and idempotency_key='test-result-0001';

  perform public.complete_engine_execution(
    v_org,
    (select id from public.engine_executions where organization_id=v_org and idempotency_key='test-result-0001'),
    jsonb_build_object(
      'contract','BA-LABS/ENGINE-RESULT',
      'contract_version','1.0.0',
      'request_id','11111111-1111-4111-8111-111111111111',
      'execution_id','33333333-3333-4333-8333-333333333333',
      'engine',jsonb_build_object('engine_id','environmental.timeseries.qc','engine_version','0.1.0'),
      'input_snapshot_sha256',repeat('d',64),
      'status','completed',
      'started_at',now(),
      'completed_at',now(),
      'result',jsonb_build_object(
        'outcome','success',
        'value',jsonb_build_object('series',jsonb_build_array(),'summary',jsonb_build_object('series_count',0)),
        'limitations',jsonb_build_array('QC only'),
        'quality_flags',jsonb_build_array(),
        'provenance',jsonb_build_object('algorithm','test-v1','libraries',jsonb_build_array())
      )
    ),
    now()
  );
  if not exists (
    select 1 from public.engine_execution_results r
    join public.engine_executions e on e.organization_id=r.organization_id and e.id=r.execution_id
    where r.organization_id=v_org and e.idempotency_key='test-result-0001'
      and r.outcome='success' and r.result_type='environmental.timeseries.qc'
      and e.status='completed'
  ) then raise exception 'structured result and completed execution must persist atomically'; end if;

  begin
    update public.engine_execution_results set outcome='review_required'
    where organization_id=v_org and result_type='environmental.timeseries.qc';
    raise exception 'immutable engine result was modified';
  exception when sqlstate '55000' then null;
  end;

  -- Empty biological snapshots are valid and must persist as insufficient_data.
  insert into public.engine_executions(
    organization_id,request_id,idempotency_key,engine_id,engine_version,scope,
    input_record_ids,input_snapshot_sha256,request_payload,status,requested_by
  ) values (
    v_org,'44444444-4444-4444-8444-444444444444','test-empty-snapshot-0001',
    'biological.context.features','0.1.0',
    '{"organization_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","culture_id":"55555555-5555-4555-8555-555555555555"}',
    '{}'::uuid[],repeat('e',64),
    '{"input":{"record_ids":[],"records":[]},"parameters":{"window_start":"2026-11-10T00:00:00Z","window_end":"2026-11-11T00:00:00Z"}}',
    'queued',v_user
  );
  update public.engine_executions
    set status='running', started_at=now(), updated_at=now()
    where organization_id=v_org and idempotency_key='test-empty-snapshot-0001';

  perform public.complete_engine_execution(
    v_org,
    (select id from public.engine_executions where organization_id=v_org and idempotency_key='test-empty-snapshot-0001'),
    jsonb_build_object(
      'contract','BA-LABS/ENGINE-RESULT',
      'contract_version','1.0.0',
      'request_id','44444444-4444-4444-8444-444444444444',
      'execution_id','66666666-6666-4666-8666-666666666666',
      'engine',jsonb_build_object('engine_id','biological.context.features','engine_version','0.1.0'),
      'input_snapshot_sha256',repeat('e',64),
      'status','completed',
      'started_at',now(),
      'completed_at',now(),
      'result',jsonb_build_object(
        'outcome','insufficient_data',
        'value',jsonb_build_object('coverage',jsonb_build_object('source_record_count',0)),
        'limitations',jsonb_build_array('No source records were available in the requested window.'),
        'quality_flags',jsonb_build_array('insufficient_source_records'),
        'provenance',jsonb_build_object('algorithm','biological.context.features@0.1.0','source_record_ids',jsonb_build_array())
      )
    ),
    now()
  );
  if not exists (
    select 1 from public.engine_execution_results r
    join public.engine_executions e on e.organization_id=r.organization_id and e.id=r.execution_id
    where r.organization_id=v_org and e.idempotency_key='test-empty-snapshot-0001'
      and r.outcome='insufficient_data'
      and cardinality(r.input_record_ids)=0
      and e.status='completed'
  ) then raise exception 'empty biological snapshot must persist as an insufficient_data result'; end if;

  raise notice 'engine execution ledger security and idempotency contract passed';
end $$;

rollback;
