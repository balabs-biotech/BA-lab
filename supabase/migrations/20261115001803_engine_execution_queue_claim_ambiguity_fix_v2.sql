
create or replace function public.claim_engine_job(
  p_worker_id text,
  p_lease_seconds integer default 90
)
returns table (
  job_id uuid,
  organization_id uuid,
  engine_code text,
  contract_version text,
  payload jsonb,
  attempt integer,
  max_attempts integer,
  lease_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.engine_jobs%rowtype;
  v_token uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 or length(p_worker_id) > 160 then
    raise exception 'invalid_worker_id' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 15 or p_lease_seconds > 3600 then
    raise exception 'invalid_lease_seconds' using errcode = '22023';
  end if;

  update public.engine_jobs j
  set status = 'failed',
      completed_at = v_now,
      updated_at = v_now,
      last_error = coalesce(j.last_error, jsonb_build_object(
        'code','retry_budget_exhausted',
        'message','Execution lease expired after the maximum number of attempts'
      ))
  where j.status = 'running'
    and j.attempts >= j.max_attempts
    and not exists (
      select 1 from public.engine_job_leases l
      where l.job_id = j.id and l.expires_at > v_now
    );

  update public.engine_job_runs r
  set status = 'abandoned',
      finished_at = v_now,
      error = coalesce(r.error, jsonb_build_object(
        'code','retry_budget_exhausted',
        'message','Worker lease expired and no attempts remain'
      ))
  from public.engine_jobs j
  where r.job_id = j.id
    and r.status = 'running'
    and j.status = 'failed'
    and r.finished_at is null;

  delete from public.engine_job_leases l
  using public.engine_jobs j
  where l.job_id = j.id
    and j.status = 'failed'
    and l.expires_at <= v_now;

  select j.* into v_job
  from public.engine_jobs j
  left join public.engine_job_leases l on l.job_id = j.id
  where j.attempts < j.max_attempts
    and j.available_at <= v_now
    and (
      j.status = 'queued'
      or (j.status = 'running' and (l.job_id is null or l.expires_at < v_now))
    )
  order by j.priority desc, j.available_at asc, j.created_at asc
  for update of j skip locked
  limit 1;

  if not found then
    return;
  end if;

  v_token := gen_random_uuid();

  update public.engine_jobs j
  set status = 'running',
      attempts = j.attempts + 1,
      started_at = coalesce(j.started_at, v_now),
      updated_at = v_now
  where j.id = v_job.id
  returning j.* into v_job;

  insert into public.engine_job_leases(job_id, worker_id, lease_token, leased_at, heartbeat_at, expires_at, attempt)
  values (v_job.id, p_worker_id, v_token, v_now, v_now, v_now + make_interval(secs => p_lease_seconds), v_job.attempts)
  on conflict on constraint engine_job_leases_pkey do update
    set worker_id = excluded.worker_id,
        lease_token = excluded.lease_token,
        leased_at = excluded.leased_at,
        heartbeat_at = excluded.heartbeat_at,
        expires_at = excluded.expires_at,
        attempt = excluded.attempt;

  update public.engine_job_runs r
  set status = 'abandoned',
      finished_at = v_now,
      error = jsonb_build_object('code','lease_expired','message','Previous worker lease expired')
  where r.job_id = v_job.id and r.status = 'running';

  insert into public.engine_job_runs(
    organization_id, job_id, attempt, worker_id, lease_token, status, started_at, input_snapshot
  ) values (
    v_job.organization_id, v_job.id, v_job.attempts, p_worker_id, v_token, 'running', v_now, v_job.payload
  );

  return query select
    v_job.id, v_job.organization_id, v_job.engine_code, v_job.contract_version,
    v_job.payload, v_job.attempts, v_job.max_attempts, v_token,
    v_now + make_interval(secs => p_lease_seconds);
end;
$$;
revoke all on function public.claim_engine_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_engine_job(text, integer) to service_role;
;
