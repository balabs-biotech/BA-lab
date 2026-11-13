-- Recover executions abandoned by a terminated Edge Function without replaying work.
alter table public.engine_executions
  add column if not exists lease_expires_at timestamptz;

-- Preserve already-running rows during rollout; expired legacy runs become eligible for reaping.
update public.engine_executions
set lease_expires_at = coalesce(started_at, updated_at, now()) + interval '2 minutes'
where status = 'running' and lease_expires_at is null;

create index if not exists engine_executions_expired_lease_idx
  on public.engine_executions (lease_expires_at, created_at)
  where status = 'running';

create or replace function private.guard_engine_execution_lease()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = 'running' then
    if new.lease_expires_at is null then
      new.lease_expires_at := coalesce(old.lease_expires_at, clock_timestamp() + interval '2 minutes');
    end if;
  else
    new.lease_expires_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_engine_execution_lease() from public, anon, authenticated;
drop trigger if exists engine_executions_lease_guard on public.engine_executions;
create trigger engine_executions_lease_guard
  before insert or update of status, lease_expires_at
  on public.engine_executions
  for each row execute function private.guard_engine_execution_lease();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.engine_executions'::regclass
      and conname = 'engine_execution_lease_status_consistency'
  ) then
    alter table public.engine_executions
      add constraint engine_execution_lease_status_consistency
      check (
        (status = 'running' and lease_expires_at is not null)
        or (status <> 'running' and lease_expires_at is null)
      ) not valid;
  end if;
end;
$$;

alter table public.engine_executions
  validate constraint engine_execution_lease_status_consistency;

create or replace function public.reap_expired_engine_executions(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_reaped integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'recovery batch limit must be between 1 and 500'
      using errcode = '22023';
  end if;

  with expired as (
    select organization_id, id
    from public.engine_executions
    where status = 'running'
      and lease_expires_at <= v_now
    order by lease_expires_at, created_at
    for update skip locked
    limit p_limit
  ),
  reaped as (
    update public.engine_executions e
    set status = 'failed',
        error_code = 'execution_lease_expired',
        error_message = 'Execution lease expired before a terminal result was committed.',
        completed_at = v_now,
        updated_at = greatest(v_now, e.updated_at)
    from expired x
    where e.organization_id = x.organization_id
      and e.id = x.id
    returning e.id
  )
  select count(*)::integer into v_reaped from reaped;

  return v_reaped;
end;
$$;

revoke all on function public.reap_expired_engine_executions(integer) from public, anon, authenticated;
grant execute on function public.reap_expired_engine_executions(integer) to service_role;

-- Supabase production has pg_cron enabled. Keep local migration replay portable
-- by installing the recurring job only where the extension is available.
do $lease_schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and to_regnamespace('cron') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = $1'
      using 'ba-labs-engine-lease-reaper';
    execute 'select cron.schedule($1, $2, $3)'
      using 'ba-labs-engine-lease-reaper', '* * * * *',
        'select public.reap_expired_engine_executions(50);';
  end if;
end;
$lease_schedule$;

comment on column public.engine_executions.lease_expires_at is
  'Deadline for a running orchestrated execution. Expired rows are closed as failures; work is never silently replayed.';
comment on function public.reap_expired_engine_executions(integer) is
  'Service-only, bounded, concurrency-safe recovery of running executions whose lease has expired.';
