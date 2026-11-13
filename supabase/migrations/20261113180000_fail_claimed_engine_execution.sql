-- Fail a claimed execution only while the exact worker still owns a live lease.
create or replace function public.fail_claimed_engine_execution(
  p_organization_id uuid,
  p_execution_id uuid,
  p_worker_id text,
  p_error_code text,
  p_error_message text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_execution public.engine_executions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 1 and 120 then
    raise exception 'worker identity must contain between 1 and 120 characters'
      using errcode = '22023';
  end if;
  if p_error_code is null or length(btrim(p_error_code)) not between 1 and 120 then
    raise exception 'failure code must contain between 1 and 120 characters'
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
    return false;
  end if;

  update public.engine_executions
  set status = 'failed',
      error_code = btrim(p_error_code),
      error_message = left(coalesce(p_error_message, 'Execution failed.'), 1000),
      completed_at = v_now,
      updated_at = greatest(v_now, updated_at)
  where organization_id = p_organization_id
    and id = p_execution_id;

  return true;
end;
$$;

revoke all on function public.fail_claimed_engine_execution(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.fail_claimed_engine_execution(uuid,uuid,text,text,text)
  to service_role;

comment on function public.fail_claimed_engine_execution(uuid,uuid,text,text,text) is
  'Service-only worker failure transition. Requires the exact claiming worker and an unexpired running lease; stale workers cannot close executions.';
