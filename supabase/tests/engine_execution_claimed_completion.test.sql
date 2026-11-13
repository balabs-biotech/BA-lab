\set ON_ERROR_STOP on
begin;

do $$
declare
  v_org uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa40';
  v_active uuid;
  v_expired uuid;
  v_request_id uuid;
  v_result_id uuid;
  v_result jsonb;
  v_count integer;
begin
  if to_regprocedure('public.complete_claimed_engine_execution(uuid,uuid,jsonb,timestamptz,text)') is null then
    raise exception 'worker-owned completion RPC must be installed';
  end if;
  if not has_function_privilege('service_role',
      'public.complete_claimed_engine_execution(uuid,uuid,jsonb,timestamptz,text)','EXECUTE')
    or has_function_privilege('authenticated',
      'public.complete_claimed_engine_execution(uuid,uuid,jsonb,timestamptz,text)','EXECUTE')
    or has_function_privilege('anon',
      'public.complete_claimed_engine_execution(uuid,uuid,jsonb,timestamptz,text)','EXECUTE') then
    raise exception 'worker-owned completion RPC must be service-role only';
  end if;

  insert into public.organizations(id,code,name)
  values(v_org,'TEST-ENGINE-COMPLETION-40','Engine Completion Test')
  on conflict do nothing;

  insert into public.engine_executions(
    organization_id,request_id,idempotency_key,engine_id,engine_version,scope,
    input_record_ids,input_snapshot_sha256,request_payload,created_at
  ) values
    (v_org,'11111111-1111-4111-8111-111111111140','completion-active',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('a',64),'{}',now()-interval '2 minutes'),
    (v_org,'22222222-2222-4222-8222-222222222240','completion-expired',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('b',64),'{}',now()-interval '1 minute');

  select id,request_id into v_active,v_request_id from public.engine_executions
    where organization_id=v_org and idempotency_key='completion-active';
  select id into v_expired from public.engine_executions
    where organization_id=v_org and idempotency_key='completion-expired';

  select count(*) into v_count
  from public.claim_engine_executions('completion-worker',2,120,null,null);
  if v_count <> 2 then
    raise exception 'completion fixture must claim both executions';
  end if;

  v_result := jsonb_build_object(
    'contract','BA-LABS/ENGINE-RESULT',
    'status','completed',
    'execution_id',v_active::text,
    'request_id',v_request_id::text,
    'engine',jsonb_build_object('engine_id','environmental.timeseries.qc','engine_version','0.2.0'),
    'input_snapshot_sha256',repeat('a',64),
    'result',jsonb_build_object(
      'outcome','insufficient_data',
      'value','{}'::jsonb,
      'limitations','[]'::jsonb,
      'quality_flags','[]'::jsonb,
      'provenance',jsonb_build_object('algorithm','contract-test','libraries','[]'::jsonb)
    )
  );

  begin
    perform public.complete_claimed_engine_execution(
      v_org,v_active,v_result,clock_timestamp(),'different-worker'
    );
    raise exception 'a different worker must not complete this execution';
  exception when sqlstate '55000' then null;
  end;

  update public.engine_executions
  set lease_expires_at=clock_timestamp()-interval '1 second'
  where organization_id=v_org and id=v_expired;
  begin
    perform public.complete_claimed_engine_execution(
      v_org,v_expired,'{}'::jsonb,clock_timestamp(),'completion-worker'
    );
    raise exception 'an expired lease must not commit a worker result';
  exception when sqlstate '55000' then null;
  end;

  v_result_id := public.complete_claimed_engine_execution(
    v_org,v_active,v_result,clock_timestamp(),'completion-worker'
  );
  if v_result_id is null or not exists (
    select 1 from public.engine_executions
    where organization_id=v_org and id=v_active
      and status='completed' and lease_expires_at is null
  ) then
    raise exception 'the current lease owner must atomically complete and close the execution';
  end if;
  if not exists (
    select 1 from public.engine_execution_results
    where organization_id=v_org and execution_id=v_active and outcome='insufficient_data'
  ) then
    raise exception 'worker completion must persist the immutable result row';
  end if;
end $$;

rollback;
