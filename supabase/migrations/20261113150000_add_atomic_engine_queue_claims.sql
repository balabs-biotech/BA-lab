-- Atomic FIFO claims for the durable scientific execution queue.
alter table public.engine_executions
  add column if not exists claim_count integer not null default 0,
  add column if not exists claimed_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.engine_executions'::regclass
      and conname = 'engine_execution_claim_metadata_valid'
  ) then
    alter table public.engine_executions
      add constraint engine_execution_claim_metadata_valid
      check (
        claim_count >= 0
        and (claimed_by is null or length(btrim(claimed_by)) between 1 and 120)
      ) not valid;
  end if;
end;
$$;

alter table public.engine_executions
  validate constraint engine_execution_claim_metadata_valid;

create index if not exists engine_executions_queued_fifo_idx
  on public.engine_executions (created_at, id)
  where status = 'queued';

create or replace function public.claim_engine_executions(
  p_worker_id text,
  p_limit integer default 1,
  p_lease_seconds integer default 120,
  p_execution_id uuid default null,
  p_organization_id uuid default null
)
returns setof public.engine_executions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 1 and 120 then
    raise exception 'worker identity must contain between 1 and 120 characters'
      using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'claim batch limit must be between 1 and 20'
      using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception 'claim lease must be between 30 and 600 seconds'
      using errcode = '22023';
  end if;
  if (p_execution_id is null) <> (p_organization_id is null) then
    raise exception 'targeted claims require both execution and organization IDs'
      using errcode = '22023';
  end if;

  return query
  with candidates as (
    select e.organization_id, e.id
    from public.engine_executions e
    where e.status = 'queued'
      and (
        p_execution_id is null
        or (e.id = p_execution_id and e.organization_id = p_organization_id)
      )
    order by e.created_at, e.id
    for update of e skip locked
    limit p_limit
  )
  update public.engine_executions e
  set status = 'running',
      started_at = coalesce(e.started_at, v_now),
      updated_at = v_now,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      claim_count = e.claim_count + 1,
      claimed_by = btrim(p_worker_id)
  from candidates c
  where e.organization_id = c.organization_id
    and e.id = c.id
  returning e.*;
end;
$$;

revoke all on function public.claim_engine_executions(text,integer,integer,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.claim_engine_executions(text,integer,integer,uuid,uuid)
  to service_role;

comment on function public.claim_engine_executions(text,integer,integer,uuid,uuid) is
  'Service-only FIFO queue claim. Uses SKIP LOCKED, records worker identity and claim count, and assigns a bounded lease atomically.';
comment on column public.engine_executions.claim_count is
  'Number of successful worker claims. A claim is not automatically retried after lease expiry.';
comment on column public.engine_executions.claimed_by is
  'Worker identity recorded for the latest successful claim.';
