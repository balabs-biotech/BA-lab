-- Disposable PostgreSQL 17 contract fixture for the future CLI-generated migration.
-- This file is applied only after full migration replay in CI; it is not a production migration.

create table private.engine_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  engine_code text not null check (engine_code ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  engine_version text not null check (length(engine_version) between 1 and 40),
  job_type text not null check (length(job_type) between 1 and 100),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued'
    check (status in ('queued','running','retry_wait','succeeded','failed','cancelled')),
  priority integer not null default 0 check (priority between -1000 and 1000),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (length(idempotency_key) between 1 and 160),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (organization_id, idempotency_key)
);

create table private.engine_job_leases (
  lease_token uuid primary key default gen_random_uuid(),
  job_id uuid not null references private.engine_jobs(id) on delete cascade,
  worker_id text not null check (length(worker_id) between 1 and 120),
  attempt_number integer not null check (attempt_number > 0),
  leased_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  heartbeat_at timestamptz not null default clock_timestamp(),
  released_at timestamptz,
  release_reason text check (release_reason in ('completed','retry','failed','expired','cancelled')),
  unique (job_id, attempt_number)
);

create unique index engine_job_one_active_lease_idx
  on private.engine_job_leases(job_id) where released_at is null;
create index engine_jobs_claim_idx
  on private.engine_jobs(priority desc, created_at asc)
  where status in ('queued','retry_wait');
create index engine_job_leases_expiry_idx
  on private.engine_job_leases(expires_at)
  where released_at is null;

create table private.engine_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references private.engine_jobs(id) on delete cascade,
  lease_token uuid not null unique references private.engine_job_leases(lease_token),
  attempt_number integer not null check (attempt_number > 0),
  engine_version text not null,
  execution_status text not null
    check (execution_status in ('running','succeeded','retry_wait','failed','lease_expired')),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  result_summary text,
  result_data jsonb,
  error_code text,
  error_details text,
  unique (job_id, attempt_number)
);

alter table private.engine_jobs enable row level security;
alter table private.engine_job_leases enable row level security;
alter table private.engine_job_runs enable row level security;
revoke all on table private.engine_jobs, private.engine_job_leases, private.engine_job_runs
  from public, anon, authenticated, service_role;

create or replace function private.enqueue_engine_job(
  p_organization_id uuid,
  p_engine_code text,
  p_engine_version text,
  p_job_type text,
  p_payload jsonb,
  p_idempotency_key text,
  p_priority integer default 0,
  p_max_attempts integer default 3
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing private.engine_jobs%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'authenticated'
     or auth.uid() is null
     or p_organization_id is null
     or not private.is_org_member(p_organization_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_engine_code is null or p_engine_code !~ '^[a-z][a-z0-9_.-]{1,79}$'
     or p_engine_version is null or length(p_engine_version) not between 1 and 40
     or p_job_type is null or length(p_job_type) not between 1 and 100
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 160
     or p_priority not between -1000 and 1000
     or p_max_attempts not between 1 and 10 then
    raise exception 'Invalid engine job arguments' using errcode = '22023';
  end if;

  insert into private.engine_jobs (
    organization_id, engine_code, engine_version, job_type, payload,
    idempotency_key, priority, max_attempts
  ) values (
    p_organization_id, p_engine_code, p_engine_version, p_job_type, p_payload,
    p_idempotency_key, p_priority, p_max_attempts
  )
  on conflict (organization_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select * into v_existing
    from private.engine_jobs
   where organization_id = p_organization_id
     and idempotency_key = p_idempotency_key
   for update;

  if v_existing.engine_code <> p_engine_code
     or v_existing.engine_version <> p_engine_version
     or v_existing.job_type <> p_job_type
     or v_existing.payload <> p_payload
     or v_existing.priority <> p_priority
     or v_existing.max_attempts <> p_max_attempts then
    raise exception 'Engine job idempotency key payload mismatch'
      using errcode = '23505';
  end if;

  return v_existing.id;
end;
$$;

create or replace function private.get_engine_job_status(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.engine_jobs%rowtype;
begin
  select * into v_job from private.engine_jobs where id = p_job_id;
  if not found or not private.is_org_member(v_job.organization_id) then
    raise exception 'Engine job not found or access denied' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', v_job.id,
    'engine_code', v_job.engine_code,
    'engine_version', v_job.engine_version,
    'job_type', v_job.job_type,
    'status', v_job.status,
    'attempt_count', v_job.attempt_count,
    'max_attempts', v_job.max_attempts,
    'created_at', v_job.created_at,
    'updated_at', v_job.updated_at
  );
end;
$$;

create or replace function private.recover_expired_engine_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Worker role required' using errcode = '42501';
  end if;

  update private.engine_job_leases l
     set released_at = v_now, release_reason = 'expired'
    from private.engine_jobs j
   where l.job_id = j.id
     and j.status = 'running'
     and l.released_at is null
     and l.expires_at <= v_now;

  update private.engine_job_runs r
     set execution_status = 'lease_expired',
         finished_at = v_now,
         error_code = 'lease_expired',
         error_details = 'Worker lease expired before completion'
    from private.engine_job_leases l
   where r.lease_token = l.lease_token
     and l.release_reason = 'expired'
     and r.execution_status = 'running'
     and r.finished_at is null;

  update private.engine_jobs j
     set status = case when j.attempt_count >= j.max_attempts then 'failed' else 'retry_wait' end,
         available_at = case
           when j.attempt_count >= j.max_attempts then j.available_at
           else v_now + make_interval(secs => least(900, (30 * power(2::numeric, greatest(j.attempt_count - 1, 0)))::integer))
         end,
         updated_at = v_now
    from private.engine_job_leases l
   where j.id = l.job_id
     and l.release_reason = 'expired'
     and j.status = 'running';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function private.claim_engine_job(
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.engine_jobs%rowtype;
  v_token uuid;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Worker role required' using errcode = '42501';
  end if;
  if p_worker_id is null or length(p_worker_id) not between 1 and 120
     or p_lease_seconds not between 3 and 300 then
    raise exception 'Invalid worker claim arguments' using errcode = '22023';
  end if;

  perform private.recover_expired_engine_jobs();

  select * into v_job
    from private.engine_jobs
   where status in ('queued','retry_wait')
     and available_at <= v_now
     and attempt_count < max_attempts
   order by priority desc, created_at asc
   limit 1
   for update skip locked;

  if not found then
    return null;
  end if;

  update private.engine_jobs
     set status = 'running',
         attempt_count = attempt_count + 1,
         updated_at = v_now
   where id = v_job.id
   returning * into v_job;

  insert into private.engine_job_leases (
    job_id, worker_id, attempt_number, expires_at
  ) values (
    v_job.id, p_worker_id, v_job.attempt_count,
    v_now + make_interval(secs => p_lease_seconds)
  ) returning lease_token into v_token;

  insert into private.engine_job_runs (
    job_id, lease_token, attempt_number, engine_version, execution_status
  ) values (
    v_job.id, v_token, v_job.attempt_count, v_job.engine_version, 'running'
  );

  return jsonb_build_object(
    'job_id', v_job.id,
    'organization_id', v_job.organization_id,
    'engine_code', v_job.engine_code,
    'engine_version', v_job.engine_version,
    'job_type', v_job.job_type,
    'payload', v_job.payload,
    'attempt_number', v_job.attempt_count,
    'worker_id', p_worker_id,
    'lease_token', v_token,
    'lease_expires_at', v_now + make_interval(secs => p_lease_seconds)
  );
end;
$$;

create or replace function private.heartbeat_engine_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Worker role required' using errcode = '42501';
  end if;
  if p_lease_seconds not between 3 and 300 then
    raise exception 'Invalid lease duration' using errcode = '22023';
  end if;

  update private.engine_job_leases l
     set heartbeat_at = clock_timestamp(),
         expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
    from private.engine_jobs j
   where l.job_id = p_job_id
     and l.lease_token = p_lease_token
     and l.worker_id = p_worker_id
     and l.released_at is null
     and l.expires_at > clock_timestamp()
     and j.id = l.job_id
     and j.status = 'running';

  return found;
end;
$$;

create or replace function private.complete_engine_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_worker_id text,
  p_result jsonb,
  p_result_summary text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Worker role required' using errcode = '42501';
  end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'Engine result must be a JSON object' using errcode = '22023';
  end if;

  update private.engine_jobs j
     set status = 'succeeded', updated_at = v_now
   where j.id = p_job_id
     and j.status = 'running'
     and exists (
       select 1 from private.engine_job_leases l
        where l.job_id = j.id and l.lease_token = p_lease_token
          and l.worker_id = p_worker_id and l.released_at is null
          and l.expires_at > v_now
     );
  if not found then
    return false;
  end if;

  update private.engine_job_runs
     set execution_status = 'succeeded', finished_at = v_now,
         result_data = p_result, result_summary = left(p_result_summary, 2000)
   where job_id = p_job_id and lease_token = p_lease_token
     and execution_status = 'running';

  update private.engine_job_leases
     set released_at = v_now, release_reason = 'completed'
   where job_id = p_job_id and lease_token = p_lease_token
     and worker_id = p_worker_id and released_at is null;

  return true;
end;
$$;

create or replace function private.fail_engine_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_worker_id text,
  p_error_code text,
  p_error_details text,
  p_retryable boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.engine_jobs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_next text;
  v_delay integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Worker role required' using errcode = '42501';
  end if;
  if p_error_code is null or length(p_error_code) not between 1 and 100 then
    raise exception 'Invalid error code' using errcode = '22023';
  end if;

  select j.* into v_job
    from private.engine_jobs j
    join private.engine_job_leases l on l.job_id = j.id
   where j.id = p_job_id and j.status = 'running'
     and l.lease_token = p_lease_token and l.worker_id = p_worker_id
     and l.released_at is null and l.expires_at > v_now
   for update of j;

  if not found then
    return 'lease_lost';
  end if;

  v_next := case
    when p_retryable and v_job.attempt_count < v_job.max_attempts then 'retry_wait'
    else 'failed'
  end;
  v_delay := least(900, (30 * power(2::numeric, greatest(v_job.attempt_count - 1, 0)))::integer);

  update private.engine_job_runs
     set execution_status = v_next, finished_at = v_now,
         error_code = left(p_error_code, 100),
         error_details = left(coalesce(p_error_details,''), 4000)
   where job_id = p_job_id and lease_token = p_lease_token
     and execution_status = 'running';

  update private.engine_job_leases
     set released_at = v_now,
         release_reason = case when v_next = 'retry_wait' then 'retry' else 'failed' end
   where job_id = p_job_id and lease_token = p_lease_token
     and worker_id = p_worker_id and released_at is null;

  update private.engine_jobs
     set status = v_next,
         available_at = case when v_next = 'retry_wait'
           then v_now + make_interval(secs => v_delay) else available_at end,
         updated_at = v_now
   where id = p_job_id;

  return v_next;
end;
$$;

-- Public RPC wrappers are the only PostgREST entry points. The private tables
-- remain unexposed and the wrappers execute with caller privileges.
grant usage on schema private to authenticated, service_role;

create or replace function public.enqueue_engine_job(
  p_organization_id uuid, p_engine_code text, p_engine_version text,
  p_job_type text, p_payload jsonb, p_idempotency_key text,
  p_priority integer default 0, p_max_attempts integer default 3
)
returns uuid language sql security invoker set search_path = ''
as $$ select private.enqueue_engine_job(
  p_organization_id, p_engine_code, p_engine_version, p_job_type,
  p_payload, p_idempotency_key, p_priority, p_max_attempts
) $$;

create or replace function public.get_engine_job_status(p_job_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.get_engine_job_status(p_job_id) $$;

create or replace function public.claim_engine_job(p_worker_id text, p_lease_seconds integer default 60)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.claim_engine_job(p_worker_id, p_lease_seconds) $$;

create or replace function public.heartbeat_engine_job(
  p_job_id uuid, p_lease_token uuid, p_worker_id text, p_lease_seconds integer default 60
)
returns boolean language sql security invoker set search_path = ''
as $$ select private.heartbeat_engine_job(p_job_id, p_lease_token, p_worker_id, p_lease_seconds) $$;

create or replace function public.complete_engine_job(
  p_job_id uuid, p_lease_token uuid, p_worker_id text,
  p_result jsonb, p_result_summary text default null
)
returns boolean language sql security invoker set search_path = ''
as $$ select private.complete_engine_job(
  p_job_id, p_lease_token, p_worker_id, p_result, p_result_summary
) $$;

create or replace function public.fail_engine_job(
  p_job_id uuid, p_lease_token uuid, p_worker_id text,
  p_error_code text, p_error_details text, p_retryable boolean
)
returns text language sql security invoker set search_path = ''
as $$ select private.fail_engine_job(
  p_job_id, p_lease_token, p_worker_id, p_error_code, p_error_details, p_retryable
) $$;

revoke all on function private.enqueue_engine_job(uuid,text,text,text,jsonb,text,integer,integer) from public, anon, authenticated, service_role;
revoke all on function private.get_engine_job_status(uuid) from public, anon, authenticated, service_role;
revoke all on function private.recover_expired_engine_jobs() from public, anon, authenticated, service_role;
revoke all on function private.claim_engine_job(text,integer) from public, anon, authenticated, service_role;
revoke all on function private.heartbeat_engine_job(uuid,uuid,text,integer) from public, anon, authenticated, service_role;
revoke all on function private.complete_engine_job(uuid,uuid,text,jsonb,text) from public, anon, authenticated, service_role;
revoke all on function private.fail_engine_job(uuid,uuid,text,text,text,boolean) from public, anon, authenticated, service_role;
grant execute on function private.enqueue_engine_job(uuid,text,text,text,jsonb,text,integer,integer) to authenticated;
grant execute on function private.get_engine_job_status(uuid) to authenticated;
grant execute on function private.claim_engine_job(text,integer) to service_role;
grant execute on function private.heartbeat_engine_job(uuid,uuid,text,integer) to service_role;
grant execute on function private.complete_engine_job(uuid,uuid,text,jsonb,text) to service_role;
grant execute on function private.fail_engine_job(uuid,uuid,text,text,text,boolean) to service_role;

revoke all on function public.enqueue_engine_job(uuid,text,text,text,jsonb,text,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.get_engine_job_status(uuid) from public, anon, authenticated, service_role;
revoke all on function public.claim_engine_job(text,integer) from public, anon, authenticated, service_role;
revoke all on function public.heartbeat_engine_job(uuid,uuid,text,integer) from public, anon, authenticated, service_role;
revoke all on function public.complete_engine_job(uuid,uuid,text,jsonb,text) from public, anon, authenticated, service_role;
revoke all on function public.fail_engine_job(uuid,uuid,text,text,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.enqueue_engine_job(uuid,text,text,text,jsonb,text,integer,integer) to authenticated;
grant execute on function public.get_engine_job_status(uuid) to authenticated;
grant execute on function public.claim_engine_job(text,integer) to service_role;
grant execute on function public.heartbeat_engine_job(uuid,uuid,text,integer) to service_role;
grant execute on function public.complete_engine_job(uuid,uuid,text,jsonb,text) to service_role;
grant execute on function public.fail_engine_job(uuid,uuid,text,text,text,boolean) to service_role;

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
