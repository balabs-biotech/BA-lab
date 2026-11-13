-- Regression tests for the CLI-generated CultureOps queue migration.
-- Executed only against disposable PostgreSQL 17 after complete migration replay.
do $$
declare
  v_user uuid := '10000000-0000-4000-8000-000000000001';
  v_org uuid := '20000000-0000-4000-8000-000000000001';
  v_other_org uuid := '20000000-0000-4000-8000-000000000002';
  v_job uuid;
  v_duplicate uuid;
  v_claim jsonb;
  v_claim2 jsonb;
  v_token uuid;
  v_token2 uuid;
  v_status jsonb;
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
