-- Complete a worker result only while its exact claim still owns a live lease.
create or replace function public.complete_claimed_engine_execution(
  p_organization_id uuid,
  p_execution_id uuid,
  p_result jsonb,
  p_completed_at timestamptz,
  p_worker_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_execution public.engine_executions%rowtype;
begin
  if p_worker_id is null or length(btrim(p_worker_id)) not between 1 and 120 then
    raise exception 'worker identity must contain between 1 and 120 characters'
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
    or v_execution.lease_expires_at <= clock_timestamp() then
    raise exception 'execution lease is missing, expired, terminal, or owned by another worker'
      using errcode = '55000';
  end if;

  -- The row lock remains held while the existing atomic result writer validates,
  -- inserts the immutable result and closes the ledger row in this transaction.
  return public.complete_engine_execution(
    p_organization_id, p_execution_id, p_result, p_completed_at
  );
end;
$$;

revoke all on function public.complete_claimed_engine_execution(uuid,uuid,jsonb,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.complete_claimed_engine_execution(uuid,uuid,jsonb,timestamptz,text)
  to service_role;

comment on function public.complete_claimed_engine_execution(uuid,uuid,jsonb,timestamptz,text) is
  'Service-only worker completion. Requires the exact claiming worker and an unexpired running lease, then commits the result atomically.';
