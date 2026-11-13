\set ON_ERROR_STOP on
begin;

do $$
declare
  v_org uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa39';
  v_active uuid;
  v_expired uuid;
  v_terminal uuid;
  v_renewed timestamptz;
  v_count integer;
begin
  if to_regprocedure('public.renew_engine_execution_lease(uuid,uuid,text,integer)') is null then
    raise exception 'worker lease heartbeat RPC must be installed';
  end if;
  if not has_function_privilege('service_role',
      'public.renew_engine_execution_lease(uuid,uuid,text,integer)','EXECUTE')
    or has_function_privilege('authenticated',
      'public.renew_engine_execution_lease(uuid,uuid,text,integer)','EXECUTE')
    or has_function_privilege('anon',
      'public.renew_engine_execution_lease(uuid,uuid,text,integer)','EXECUTE') then
    raise exception 'worker lease heartbeat RPC must be service-role only';
  end if;

  insert into public.organizations(id,code,name)
  values(v_org,'TEST-ENGINE-HEARTBEAT-39','Engine Heartbeat Test')
  on conflict do nothing;

  insert into public.engine_executions(
    organization_id,request_id,idempotency_key,engine_id,engine_version,scope,
    input_record_ids,input_snapshot_sha256,request_payload,created_at
  ) values
    (v_org,'11111111-1111-4111-8111-111111111139','heartbeat-active',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('a',64),'{}',now()-interval '3 minutes'),
    (v_org,'22222222-2222-4222-8222-222222222239','heartbeat-expired',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('b',64),'{}',now()-interval '2 minutes'),
    (v_org,'33333333-3333-4333-8333-333333333239','heartbeat-terminal',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('c',64),'{}',now()-interval '1 minute');

  select id into v_active from public.engine_executions
    where organization_id=v_org and idempotency_key='heartbeat-active';
  select id into v_expired from public.engine_executions
    where organization_id=v_org and idempotency_key='heartbeat-expired';
  select id into v_terminal from public.engine_executions
    where organization_id=v_org and idempotency_key='heartbeat-terminal';

  select count(*) into v_count
  from public.claim_engine_executions('heartbeat-worker',3,120,null,null);
  if v_count <> 3 then
    raise exception 'heartbeat fixture must claim all three executions';
  end if;

  v_renewed := public.renew_engine_execution_lease(v_org,v_active,'heartbeat-worker',180);
  if v_renewed <= now() or v_renewed > now()+interval '181 seconds' then
    raise exception 'heartbeat must extend the active lease by the requested bounded duration';
  end if;

  begin
    perform public.renew_engine_execution_lease(v_org,v_active,'different-worker',120);
    raise exception 'a worker must not renew another worker lease';
  exception when sqlstate '55000' then null;
  end;

  update public.engine_executions
  set lease_expires_at=now()-interval '1 second'
  where organization_id=v_org and id=v_expired;
  begin
    perform public.renew_engine_execution_lease(v_org,v_expired,'heartbeat-worker',120);
    raise exception 'an expired lease must not be resurrected by heartbeat';
  exception when sqlstate '55000' then null;
  end;

  update public.engine_executions
  set status='failed', error_code='test_terminal', error_message='terminal fixture',
      completed_at=clock_timestamp(), updated_at=clock_timestamp()
  where organization_id=v_org and id=v_terminal;
  begin
    perform public.renew_engine_execution_lease(v_org,v_terminal,'heartbeat-worker',120);
    raise exception 'a terminal execution must not receive a heartbeat';
  exception when sqlstate '55000' then null;
  end;

  begin
    perform public.renew_engine_execution_lease(v_org,v_active,'heartbeat-worker',10);
    raise exception 'lease renewal below 30 seconds must be rejected';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.renew_engine_execution_lease(v_org,v_active,'heartbeat-worker',601);
    raise exception 'lease renewal above 600 seconds must be rejected';
  exception when sqlstate '22023' then null;
  end;
end $$;

rollback;
