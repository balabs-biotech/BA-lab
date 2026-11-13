\set ON_ERROR_STOP on
begin;

do $$
declare
  v_org uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32';
  v_first uuid;
  v_second uuid;
  v_target uuid;
  v_claimed uuid[];
  v_count integer;
  v_def text;
begin
  if to_regprocedure('public.claim_engine_executions(text,integer,integer,uuid,uuid)') is null then
    raise exception 'atomic engine queue claim RPC must be installed';
  end if;
  if not has_function_privilege('service_role',
      'public.claim_engine_executions(text,integer,integer,uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated',
      'public.claim_engine_executions(text,integer,integer,uuid,uuid)','EXECUTE')
    or has_function_privilege('anon',
      'public.claim_engine_executions(text,integer,integer,uuid,uuid)','EXECUTE') then
    raise exception 'queue claim RPC must be service-role only';
  end if;

  select pg_get_functiondef('public.claim_engine_executions(text,integer,integer,uuid,uuid)'::regprocedure)
    into v_def;
  if v_def not ilike '%for update%skip locked%' then
    raise exception 'queue claim RPC must use SKIP LOCKED to prevent concurrent duplicate claims';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='engine_executions'
      and column_name='claim_count'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='engine_executions'
      and column_name='claimed_by'
  ) then
    raise exception 'execution claim audit columns must exist';
  end if;

  insert into public.organizations(id,code,name)
  values(v_org,'TEST-ENGINE-CLAIM-32','Engine Queue Claim Test')
  on conflict do nothing;

  insert into public.engine_executions(
    organization_id,request_id,idempotency_key,engine_id,engine_version,scope,
    input_record_ids,input_snapshot_sha256,request_payload,created_at
  ) values
    (v_org,'11111111-1111-4111-8111-111111111132','queue-claim-first',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('a',64),'{}',now()-interval '3 minutes'),
    (v_org,'22222222-2222-4222-8222-222222222232','queue-claim-second',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('b',64),'{}',now()-interval '2 minutes'),
    (v_org,'33333333-3333-4333-8333-333333333332','queue-claim-target',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('c',64),'{}',now()-interval '1 minute');

  select id into v_first from public.engine_executions
    where organization_id=v_org and idempotency_key='queue-claim-first';
  select id into v_second from public.engine_executions
    where organization_id=v_org and idempotency_key='queue-claim-second';
  select id into v_target from public.engine_executions
    where organization_id=v_org and idempotency_key='queue-claim-target';

  select array_agg(id order by created_at,id) into v_claimed
  from public.claim_engine_executions('worker-test-a',2,120,null,null);
  if v_claimed is distinct from array[v_first,v_second] then
    raise exception 'queue claims must be FIFO and respect the requested batch limit';
  end if;

  if exists (
    select 1 from public.engine_executions
    where organization_id=v_org and id in (v_first,v_second)
      and (status <> 'running' or claimed_by <> 'worker-test-a'
        or claim_count <> 1 or lease_expires_at <= now()
        or lease_expires_at > now()+interval '121 seconds')
  ) then
    raise exception 'claimed rows must be running with worker identity, one claim and a bounded lease';
  end if;

  select count(*) into v_count
  from public.claim_engine_executions('worker-test-b',10,120,null,null);
  if v_count <> 1 then
    raise exception 'second worker must claim only the remaining queued row';
  end if;
  if exists (
    select 1 from public.engine_executions
    where organization_id=v_org and id in (v_first,v_second)
      and (claimed_by <> 'worker-test-a' or claim_count <> 1)
  ) then
    raise exception 'a second worker must not claim already-running rows';
  end if;

  select count(*) into v_count
  from public.claim_engine_executions('worker-target',1,90,v_target,v_org);
  if v_count <> 0 then
    raise exception 'targeted claim must not reclaim a row already claimed by another worker';
  end if;

  begin
    perform * from public.claim_engine_executions('worker-invalid',0,120,null,null);
    raise exception 'zero claim batch must be rejected';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform * from public.claim_engine_executions('worker-invalid',1,10,null,null);
    raise exception 'lease shorter than 30 seconds must be rejected';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform * from public.claim_engine_executions('worker-invalid',1,120,v_target,null);
    raise exception 'targeted claim without organization must be rejected';
  exception when sqlstate '22023' then null;
  end;
end $$;

rollback;
