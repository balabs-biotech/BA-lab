\set ON_ERROR_STOP on
begin;

do $$
declare
  v_org uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa41';
  v_active uuid;
  v_expired uuid;
  v_count integer;
  v_failed boolean;
begin
  if to_regprocedure('public.fail_claimed_engine_execution(uuid,uuid,text,text,text)') is null then
    raise exception 'worker-owned failure RPC must be installed';
  end if;
  if not has_function_privilege('service_role',
      'public.fail_claimed_engine_execution(uuid,uuid,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated',
      'public.fail_claimed_engine_execution(uuid,uuid,text,text,text)','EXECUTE')
    or has_function_privilege('anon',
      'public.fail_claimed_engine_execution(uuid,uuid,text,text,text)','EXECUTE') then
    raise exception 'worker-owned failure RPC must be service-role only';
  end if;

  insert into public.organizations(id,code,name)
  values(v_org,'TEST-ENGINE-FAILURE-41','Engine Failure Test')
  on conflict do nothing;

  insert into public.engine_executions(
    organization_id,request_id,idempotency_key,engine_id,engine_version,scope,
    input_record_ids,input_snapshot_sha256,request_payload,created_at
  ) values
    (v_org,'11111111-1111-4111-8111-111111111141','failure-active',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('a',64),'{}',now()-interval '2 minutes'),
    (v_org,'22222222-2222-4222-8222-222222222241','failure-expired',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('b',64),'{}',now()-interval '1 minute');

  select id into v_active from public.engine_executions
    where organization_id=v_org and idempotency_key='failure-active';
  select id into v_expired from public.engine_executions
    where organization_id=v_org and idempotency_key='failure-expired';

  select count(*) into v_count
  from public.claim_engine_executions('failure-worker',2,120,null,null);
  if v_count <> 2 then
    raise exception 'failure fixture must claim both executions';
  end if;

  v_failed := public.fail_claimed_engine_execution(
    v_org,v_active,'different-worker','worker_failed','must not be accepted'
  );
  if v_failed then
    raise exception 'a different worker must not fail this execution';
  end if;

  update public.engine_executions
  set lease_expires_at=clock_timestamp()-interval '1 second'
  where organization_id=v_org and id=v_expired;
  v_failed := public.fail_claimed_engine_execution(
    v_org,v_expired,'failure-worker','worker_failed','expired lease'
  );
  if v_failed then
    raise exception 'an expired lease must not be closed by a stale worker';
  end if;

  v_failed := public.fail_claimed_engine_execution(
    v_org,v_active,'failure-worker','worker_failed','bounded test failure'
  );
  if not v_failed or not exists (
    select 1 from public.engine_executions
    where organization_id=v_org and id=v_active
      and status='failed' and error_code='worker_failed'
      and lease_expires_at is null and completed_at is not null
  ) then
    raise exception 'the current lease owner must atomically fail and close the execution';
  end if;
end $$;

rollback;
