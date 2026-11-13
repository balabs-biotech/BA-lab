\set ON_ERROR_STOP on
begin;

do $$
declare
  v_org uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31';
  v_oldest uuid;
  v_second uuid;
  v_active uuid;
  v_reaped integer;
begin
  if to_regprocedure('public.reap_expired_engine_executions(integer)') is null then
    raise exception 'expired execution recovery RPC must be installed';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='engine_executions'
      and column_name='lease_expires_at'
  ) then
    raise exception 'execution lease expiry column must exist';
  end if;
  if not has_function_privilege('service_role','public.reap_expired_engine_executions(integer)','EXECUTE')
    or has_function_privilege('authenticated','public.reap_expired_engine_executions(integer)','EXECUTE')
    or has_function_privilege('anon','public.reap_expired_engine_executions(integer)','EXECUTE') then
    raise exception 'lease recovery RPC must be service-role only';
  end if;

  insert into public.organizations(id,code,name)
  values(v_org,'TEST-ENGINE-LEASE-31','Engine Lease Test Organization')
  on conflict do nothing;

  insert into public.engine_executions(
    organization_id,request_id,idempotency_key,engine_id,engine_version,scope,
    input_record_ids,input_snapshot_sha256,request_payload,status
  ) values
    (v_org,'11111111-1111-4111-8111-111111111131','lease-expired-oldest',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('a',64),'{}','queued'),
    (v_org,'22222222-2222-4222-8222-222222222231','lease-expired-second',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('b',64),'{}','queued'),
    (v_org,'33333333-3333-4333-8333-333333333331','lease-still-active',
     'environmental.timeseries.qc','0.2.0','{}','{}',repeat('c',64),'{}','queued');

  select id into v_oldest from public.engine_executions
    where organization_id=v_org and idempotency_key='lease-expired-oldest';
  select id into v_second from public.engine_executions
    where organization_id=v_org and idempotency_key='lease-expired-second';
  select id into v_active from public.engine_executions
    where organization_id=v_org and idempotency_key='lease-still-active';

  update public.engine_executions set status='running', started_at=now(),
    lease_expires_at=now()-interval '2 minutes', updated_at=now()
    where organization_id=v_org and id=v_oldest;
  update public.engine_executions set status='running', started_at=now(),
    lease_expires_at=now()-interval '1 minute', updated_at=now()
    where organization_id=v_org and id=v_second;
  update public.engine_executions set status='running', started_at=now(),
    lease_expires_at=now()+interval '2 minutes', updated_at=now()
    where organization_id=v_org and id=v_active;

  v_reaped := public.reap_expired_engine_executions(1);
  if v_reaped <> 1 then
    raise exception 'bounded recovery must reap exactly one expired execution, got %', v_reaped;
  end if;
  if not exists (
    select 1 from public.engine_executions
    where organization_id=v_org and id=v_oldest and status='failed'
      and error_code='execution_lease_expired'
      and completed_at is not null and lease_expires_at is null
  ) then
    raise exception 'oldest expired execution must become a terminal lease-expired failure';
  end if;
  if not exists (
    select 1 from public.engine_executions
    where organization_id=v_org and id=v_second and status='running'
      and lease_expires_at < now()
  ) then
    raise exception 'recovery batch limit must leave the second expired execution untouched';
  end if;
  if not exists (
    select 1 from public.engine_executions
    where organization_id=v_org and id=v_active and status='running'
      and lease_expires_at > now()
  ) then
    raise exception 'recovery must not fail an execution with an active lease';
  end if;

  v_reaped := public.reap_expired_engine_executions(10);
  if v_reaped <> 1 then
    raise exception 'second recovery pass must reap the remaining expired execution exactly once';
  end if;
  if (select status from public.engine_executions where organization_id=v_org and id=v_active) <> 'running' then
    raise exception 'active execution must remain running';
  end if;
  if public.reap_expired_engine_executions(10) <> 0 then
    raise exception 'terminal executions must not be reaped more than once';
  end if;

  begin
    perform public.reap_expired_engine_executions(0);
    raise exception 'zero-sized recovery batch must be rejected';
  exception when sqlstate '22023' then null;
  end;
end $$;

rollback;
