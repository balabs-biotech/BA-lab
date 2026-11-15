
create table if not exists public.engine_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  engine_code text not null check (length(engine_code) between 1 and 100),
  contract_version text not null check (length(contract_version) between 1 and 32),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  idempotency_key text,
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','cancelled')),
  priority smallint not null default 0,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  correlation_id uuid,
  parent_job_id uuid,
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  last_error jsonb check (last_error is null or jsonb_typeof(last_error) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engine_jobs_org_id_unique unique (organization_id, id),
  constraint engine_jobs_parent_fk foreign key (organization_id, parent_job_id)
    references public.engine_jobs(organization_id, id) on delete set null,
  constraint engine_jobs_idempotency_unique unique (organization_id, idempotency_key)
);

create index if not exists engine_jobs_claim_idx
  on public.engine_jobs (status, available_at, priority desc, created_at);
create index if not exists engine_jobs_org_created_idx
  on public.engine_jobs (organization_id, created_at desc);
create index if not exists engine_jobs_correlation_idx
  on public.engine_jobs (organization_id, correlation_id)
  where correlation_id is not null;

create table if not exists public.engine_job_leases (
  job_id uuid primary key references public.engine_jobs(id) on delete cascade,
  worker_id text not null check (length(worker_id) between 1 and 160),
  lease_token uuid not null,
  leased_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempt integer not null check (attempt > 0)
);
create index if not exists engine_job_leases_expiry_idx
  on public.engine_job_leases (expires_at);

create table if not exists public.engine_job_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null,
  attempt integer not null check (attempt > 0),
  worker_id text not null,
  lease_token uuid not null,
  status text not null default 'running'
    check (status in ('running','succeeded','failed','abandoned')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  input_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(input_snapshot) = 'object'),
  output_snapshot jsonb
    check (output_snapshot is null or jsonb_typeof(output_snapshot) = 'object'),
  error jsonb check (error is null or jsonb_typeof(error) = 'object'),
  constraint engine_job_runs_attempt_unique unique (job_id, attempt),
  constraint engine_job_runs_job_org_fk foreign key (organization_id, job_id)
    references public.engine_jobs(organization_id, id) on delete cascade
);
create index if not exists engine_job_runs_org_job_idx
  on public.engine_job_runs (organization_id, job_id, started_at desc);

alter table public.engine_jobs enable row level security;
alter table public.engine_job_leases enable row level security;
alter table public.engine_job_runs enable row level security;

drop policy if exists engine_jobs_select on public.engine_jobs;
create policy engine_jobs_select on public.engine_jobs
  for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists engine_jobs_insert on public.engine_jobs;
create policy engine_jobs_insert on public.engine_jobs
  for insert to authenticated
  with check (
    private.is_org_writer(organization_id)
    and status = 'queued'
    and attempts = 0
    and created_by = auth.uid()
  );

drop policy if exists engine_job_runs_select on public.engine_job_runs;
create policy engine_job_runs_select on public.engine_job_runs
  for select to authenticated
  using (private.is_org_member(organization_id));

revoke all on public.engine_job_leases from anon, authenticated;
revoke insert, update, delete on public.engine_jobs from anon, authenticated;
grant select on public.engine_jobs to authenticated;
grant insert on public.engine_jobs to authenticated;
revoke all on public.engine_job_runs from anon, authenticated;
grant select on public.engine_job_runs to authenticated;

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

  select j.* into v_job
  from public.engine_jobs j
  left join public.engine_job_leases l on l.job_id = j.id
  where j.attempts < j.max_attempts
    and j.available_at <= v_now
    and (
      j.status = 'queued'
      or (j.status = 'running' and l.expires_at < v_now)
    )
  order by j.priority desc, j.available_at asc, j.created_at asc
  for update of j skip locked
  limit 1;

  if not found then
    return;
  end if;

  v_token := gen_random_uuid();

  update public.engine_jobs
  set status = 'running',
      attempts = attempts + 1,
      started_at = coalesce(started_at, v_now),
      updated_at = v_now
  where id = v_job.id
  returning * into v_job;

  insert into public.engine_job_leases(job_id, worker_id, lease_token, leased_at, heartbeat_at, expires_at, attempt)
  values (v_job.id, p_worker_id, v_token, v_now, v_now, v_now + make_interval(secs => p_lease_seconds), v_job.attempts)
  on conflict (job_id) do update
    set worker_id = excluded.worker_id,
        lease_token = excluded.lease_token,
        leased_at = excluded.leased_at,
        heartbeat_at = excluded.heartbeat_at,
        expires_at = excluded.expires_at,
        attempt = excluded.attempt;

  update public.engine_job_runs
  set status = 'abandoned',
      finished_at = v_now,
      error = jsonb_build_object('code','lease_expired','message','Previous worker lease expired')
  where job_id = v_job.id and status = 'running';

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

create or replace function public.heartbeat_engine_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 90
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expiry timestamptz;
begin
  if p_lease_seconds is null or p_lease_seconds < 15 or p_lease_seconds > 3600 then
    raise exception 'invalid_lease_seconds' using errcode = '22023';
  end if;
  update public.engine_job_leases
  set heartbeat_at = clock_timestamp(),
      expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
  where job_id = p_job_id
    and lease_token = p_lease_token
    and expires_at > clock_timestamp()
  returning expires_at into v_expiry;
  if v_expiry is null then
    raise exception 'lease_not_owned_or_expired' using errcode = 'P0001';
  end if;
  return v_expiry;
end;
$$;

create or replace function public.finish_engine_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_status text,
  p_output jsonb default null,
  p_error jsonb default null,
  p_retry_delay_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_lease public.engine_job_leases%rowtype;
  v_job public.engine_jobs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_final_status text;
begin
  if p_status not in ('succeeded','failed') then
    raise exception 'invalid_terminal_status' using errcode = '22023';
  end if;
  if p_output is not null and jsonb_typeof(p_output) <> 'object' then
    raise exception 'output_must_be_object' using errcode = '22023';
  end if;
  if p_error is not null and jsonb_typeof(p_error) <> 'object' then
    raise exception 'error_must_be_object' using errcode = '22023';
  end if;
  if p_retry_delay_seconds is null or p_retry_delay_seconds < 0 or p_retry_delay_seconds > 86400 then
    raise exception 'invalid_retry_delay' using errcode = '22023';
  end if;

  select * into v_lease
  from public.engine_job_leases
  where job_id = p_job_id and lease_token = p_lease_token
    and expires_at > v_now
  for update;
  if not found then
    raise exception 'lease_not_owned_or_expired' using errcode = 'P0001';
  end if;

  select * into v_job from public.engine_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'running' then
    raise exception 'job_not_running' using errcode = 'P0001';
  end if;

  v_final_status := case
    when p_status = 'failed' and v_job.attempts < v_job.max_attempts then 'queued'
    else p_status
  end;

  update public.engine_jobs
  set status = v_final_status,
      result = case when p_status = 'succeeded' then p_output else result end,
      last_error = case when p_status = 'failed' then p_error else null end,
      available_at = case when v_final_status = 'queued'
        then v_now + make_interval(secs => p_retry_delay_seconds) else available_at end,
      completed_at = case when v_final_status in ('succeeded','failed') then v_now else null end,
      updated_at = v_now
  where id = p_job_id;

  update public.engine_job_runs
  set status = p_status,
      finished_at = v_now,
      output_snapshot = case when p_status = 'succeeded' then p_output else null end,
      error = case when p_status = 'failed' then p_error else null end
  where job_id = p_job_id and attempt = v_lease.attempt and lease_token = p_lease_token;

  delete from public.engine_job_leases
  where job_id = p_job_id and lease_token = p_lease_token;
end;
$$;

revoke all on function public.claim_engine_job(text, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_engine_job(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_engine_job(uuid, uuid, text, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.claim_engine_job(text, integer) to service_role;
grant execute on function public.heartbeat_engine_job(uuid, uuid, integer) to service_role;
grant execute on function public.finish_engine_job(uuid, uuid, text, jsonb, jsonb, integer) to service_role;
;
