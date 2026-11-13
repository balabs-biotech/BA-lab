-- Allow the current queue worker to extend its own active lease without reviving expired work.
create or replace function public.renew_engine_execution_lease(
  p_organization_id uuid,
  p_execution_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 120
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_execution public.engine_executions%rowtype;
  v_lease_expires_at timestamptz;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 1 and 120 then
    raise exception 'worker identity must contain between 1 and 120 characters'
      using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception 'lease renewal must be between 30 and 600 seconds'
      using errcode = '22023';
  end if;

  select * into v_execution
  from public.engine_executions
  where organization_id = p_organization_id
    and id = p_execution_id
  for update;

  if not found
    or v_execution.status <> 'running'
    or v_execution.claimed_by is distinct from btrim(p_worker_id)
    or v_execution.lease_expires_at is null
    or v_execution.lease_expires_at <= v_now then
    raise exception 'execution lease is missing, expired, terminal, or owned by another worker'
      using errcode = '55000';
  end if;

  v_lease_expires_at := v_now + make_interval(secs => p_lease_seconds);
  update public.engine_executions
  set lease_expires_at = v_lease_expires_at,
      updated_at = greatest(v_now, updated_at)
  where organization_id = p_organization_id
    and id = p_execution_id;

  return v_lease_expires_at;
end;
$$;

revoke all on function public.renew_engine_execution_lease(uuid,uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.renew_engine_execution_lease(uuid,uuid,text,integer)
  to service_role;

comment on function public.renew_engine_execution_lease(uuid,uuid,text,integer) is
  'Service-only worker heartbeat. Extends only a non-expired running lease owned by the exact claiming worker; cannot resurrect expired or terminal work.';
