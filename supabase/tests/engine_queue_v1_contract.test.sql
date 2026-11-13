-- Regression tests for the CLI-generated CultureOps queue migration.
-- Executed only against disposable PostgreSQL 17 after complete migration replay.
do $$
declare
  v_user uuid := '10000000-0000-4000-8000-000000000001';
  v_org uuid := '20000000-0000-4000-8000-000000000001';
  v_other_org uuid := '20000000-0000-4000-8000-000000000002';
  v_job uuid;
  v_other_job uuid;
  v_priority_a uuid;
  v_priority_b uuid;
  v_priority_c uuid;
  v_duplicate uuid;
  v_claim jsonb;
  v_claim2 jsonb;
  v_token uuid;
  v_token2 uuid;
  v_status jsonb;
  v_attempt integer;
begin
  insert into auth.users(id) values (v_user) on conflict do nothing;
  insert into public.organizations(id, code, name)
  values (v_org, 'QUEUE-TEST', 'Queue test org'),
         (v_other_org, 'QUEUE-OTHER', 'Queue other org')
  on conflict do nothing;
  insert into public.organization_members(organization_id, user_id, role)
  values (v_org, v_user, 'member')
  on conflict do nothing;

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',v_user)::text, true);

  v_job := public.enqueue_engine_job(
    v_org, 'demo.engine', '1.0.0', 'contract_test',
    '{"input":1}'::jsonb, 'queue-idem-001', 10, 2
  );
  v_duplicate := public.enqueue_engine_job(
    v_org, 'demo.engine', '1.0.0', 'contract_test',
    '{"input":1}'::jsonb, 'queue-idem-001', 10, 2
  );
  if v_job <> v_duplicate then
    raise exception 'Idempotent enqueue returned different job ids';
  end if;

  begin
    perform public.enqueue_engine_job(
      v_org, 'demo.engine', '1.0.0', 'contract_test',
      '{"input":2}'::jsonb, 'queue-idem-001', 10, 2
    );
    raise exception 'Idempotency payload mismatch was not rejected';
  exception when unique_violation then
    null;
  end;

  v_status := public.get_engine_job_status(v_job);
  if v_status->>'status' <> 'queued' then
    raise exception 'Unexpected initial job status: %', v_status;
  end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('role','service_role','sub',v_user)::text, true);

  v_claim := public.claim_engine_job('worker-a', 60);
  if v_claim is null or (v_claim->>'job_id')::uuid <> v_job then
    raise exception 'Worker did not claim the expected job';
  end if;
  v_token := (v_claim->>'lease_token')::uuid;

  if not public.heartbeat_engine_job(v_job, v_token, 'worker-a', 60) then
    raise exception 'Current lease heartbeat was rejected';
  end if;
  if not public.complete_engine_job(v_job, v_token, 'worker-a', '{"value":42}'::jsonb, 'ok') then
    raise exception 'Current lease completion was rejected';
  end if;

  v_status := public.get_engine_job_status(v_job);
  if v_status->>'status' <> 'succeeded' then
    raise exception 'Job did not reach succeeded: %', v_status;
  end if;

  -- A second attempt expires. Reclaim must issue a new fencing token.
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',v_user)::text, true);
  v_job := public.enqueue_engine_job(
    v_org, 'demo.engine', '1.0.0', 'expiry_test',
    '{"input":2}'::jsonb, 'queue-expiry-001', 0, 2
  );
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','service_role','sub',v_user)::text, true);
  v_claim := public.claim_engine_job('worker-a', 60);
  v_token := (v_claim->>'lease_token')::uuid;

  update private.engine_job_leases
     set expires_at = clock_timestamp() - interval '1 second'
   where lease_token = v_token;
  perform private.recover_expired_engine_jobs();
  -- Expiry recovery applies exponential backoff; advance it explicitly in this test.
  update private.engine_jobs set available_at = clock_timestamp()
   where id = v_job and status = 'retry_wait';

  v_claim2 := public.claim_engine_job('worker-b', 60);
  if v_claim2 is null or (v_claim2->>'job_id')::uuid <> v_job then
    raise exception 'Expired job was not recovered';
  end if;
  v_token2 := (v_claim2->>'lease_token')::uuid;
  if v_token = v_token2 then
    raise exception 'Reclaim reused the previous fencing token';
  end if;
  if public.heartbeat_engine_job(v_job, v_token, 'worker-a', 60) then
    raise exception 'Stale worker heartbeat was accepted';
  end if;
  if public.complete_engine_job(v_job, v_token, 'worker-a', '{"stale":true}'::jsonb, 'stale') then
    raise exception 'Stale worker completion was accepted';
  end if;
  if not public.complete_engine_job(v_job, v_token2, 'worker-b', '{"fresh":true}'::jsonb, 'fresh') then
    raise exception 'New lease completion was rejected';
  end if;




  -- Claim ordering is priority-descending, then FIFO within equal priority.
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',v_user)::text, true);
  v_priority_a := public.enqueue_engine_job(
    v_org, 'demo.engine', '1.0.0', 'priority_test',
    '{"order":"A"}'::jsonb, 'priority-a', 10, 1
  );
  v_priority_b := public.enqueue_engine_job(
    v_org, 'demo.engine', '1.0.0', 'priority_test',
    '{"order":"B"}'::jsonb, 'priority-b', 1, 1
  );
  v_priority_c := public.enqueue_engine_job(
    v_org, 'demo.engine', '1.0.0', 'priority_test',
    '{"order":"C"}'::jsonb, 'priority-c', 10, 1
  );
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','service_role','sub',v_user)::text, true);
  v_claim := public.claim_engine_job('worker-priority-a', 60);
  if (v_claim->>'job_id')::uuid <> v_priority_a then
    raise exception 'Highest priority FIFO-first job was not claimed first';
  end if;
  v_token := (v_claim->>'lease_token')::uuid;
  perform public.complete_engine_job(v_priority_a, v_token, 'worker-priority-a', '{"ok":true}'::jsonb, 'A');

  v_claim := public.claim_engine_job('worker-priority-c', 60);
  if (v_claim->>'job_id')::uuid <> v_priority_c then
    raise exception 'Second high-priority FIFO job was not claimed before lower priority';
  end if;
  v_token := (v_claim->>'lease_token')::uuid;
  perform public.complete_engine_job(v_priority_c, v_token, 'worker-priority-c', '{"ok":true}'::jsonb, 'C');

  v_claim := public.claim_engine_job('worker-priority-b', 60);
  if (v_claim->>'job_id')::uuid <> v_priority_b then
    raise exception 'Lower-priority job was not claimed after high-priority jobs';
  end if;
  v_token := (v_claim->>'lease_token')::uuid;
  perform public.complete_engine_job(v_priority_b, v_token, 'worker-priority-b', '{"ok":true}'::jsonb, 'B');

  -- Transient failures retry with backoff; max-attempt exhaustion is terminal.
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',v_user)::text, true);
  v_job := public.enqueue_engine_job(
    v_org, 'demo.engine', '1.0.0', 'retry_test',
    '{"input":3}'::jsonb, 'queue-retry-001', 0, 2
  );
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','service_role','sub',v_user)::text, true);
  v_claim := public.claim_engine_job('worker-retry-a', 60);
  v_token := (v_claim->>'lease_token')::uuid;
  if public.fail_engine_job(v_job, v_token, 'worker-retry-a',
      'temporary_error', 'first attempt', true) <> 'retry_wait' then
    raise exception 'Retryable first failure did not enter retry_wait';
  end if;
  select attempt_count into v_attempt from private.engine_jobs where id = v_job;
  if v_attempt <> 1 or not exists (
    select 1 from private.engine_jobs
     where id = v_job and status = 'retry_wait'
       and available_at > clock_timestamp()
  ) then
    raise exception 'Retry attempt count or backoff was not persisted';
  end if;

  update private.engine_jobs set available_at = clock_timestamp()
   where id = v_job;
  v_claim := public.claim_engine_job('worker-retry-b', 60);
  v_token := (v_claim->>'lease_token')::uuid;
  if public.fail_engine_job(v_job, v_token, 'worker-retry-b',
      'temporary_error', 'second attempt', true) <> 'failed' then
    raise exception 'Max-attempt exhaustion did not reach failed';
  end if;
  select attempt_count into v_attempt from private.engine_jobs where id = v_job;
  if v_attempt <> 2 then
    raise exception 'Attempt counter did not increment on each claim';
  end if;

  -- A user who belongs only to one organization cannot inspect another tenant's job.
  insert into private.engine_jobs (
    organization_id, engine_code, engine_version, job_type, payload, idempotency_key
  ) values (
    v_other_org, 'demo.engine', '1.0.0', 'tenant_test', '{}'::jsonb, 'other-tenant-job'
  ) returning id into v_other_job;
  perform set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',v_user)::text, true);
  begin
    perform public.get_engine_job_status(v_other_job);
    raise exception 'Cross-organization job status read was accepted';
  exception when insufficient_privilege then
    null;
  end;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'private' and c.relname = 'engine_jobs' and c.relrowsecurity
  ) or not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'private' and c.relname = 'engine_job_leases' and c.relrowsecurity
  ) or not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'private' and c.relname = 'engine_job_runs' and c.relrowsecurity
  ) then
    raise exception 'Queue tables must have RLS enabled';
  end if;

  if has_function_privilege('authenticated','private.recover_expired_engine_jobs()','EXECUTE')
     or has_function_privilege('anon','private.recover_expired_engine_jobs()','EXECUTE') then
    raise exception 'Internal lease recovery function is directly executable by clients';
  end if;

  if (select prosecdef from pg_proc where oid = 'public.claim_engine_job(text,integer)'::regprocedure)
     or (select prosecdef from pg_proc where oid = 'public.enqueue_engine_job(uuid,text,text,text,jsonb,text,integer,integer)'::regprocedure) then
    raise exception 'Public PostgREST wrappers must use SECURITY INVOKER';
  end if;

  if has_table_privilege('anon','private.engine_jobs','SELECT')
     or has_table_privilege('authenticated','private.engine_jobs','SELECT')
     or has_table_privilege('service_role','private.engine_jobs','SELECT') then
    raise exception 'A client/backend role has direct queue table access';
  end if;
  if has_function_privilege('authenticated','public.claim_engine_job(text,integer)','EXECUTE')
     or has_function_privilege('anon','public.enqueue_engine_job(uuid,text,text,text,jsonb,text,integer,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.complete_engine_job(uuid,uuid,text,jsonb,text)','EXECUTE') then
    raise exception 'Queue RPC grants are broader than intended';
  end if;
end;
$$;
