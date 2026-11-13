-- Permit heartbeat-only updates while preserving all other running-row immutability.
create or replace function private.guard_engine_execution_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.id is distinct from old.id
    or new.request_id is distinct from old.request_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.engine_id is distinct from old.engine_id
    or new.engine_version is distinct from old.engine_version
    or new.scope is distinct from old.scope
    or new.input_record_ids is distinct from old.input_record_ids
    or new.input_snapshot_sha256 is distinct from old.input_snapshot_sha256
    or new.request_payload is distinct from old.request_payload
    or new.requested_by is distinct from old.requested_by
    or new.created_at is distinct from old.created_at then
    raise exception 'engine execution identity and input snapshot are immutable'
      using errcode = '55000';
  end if;

  if old.status in ('completed', 'failed') then
    raise exception 'terminal engine executions are immutable'
      using errcode = '55000';
  end if;

  if old.status = 'queued' and new.status not in ('running', 'failed') then
    raise exception 'invalid engine execution transition from queued'
      using errcode = '55000';
  end if;
  if old.status = 'running' and new.status = 'running' then
    if (to_jsonb(new) - 'lease_expires_at' - 'updated_at')
      is distinct from (to_jsonb(old) - 'lease_expires_at' - 'updated_at') then
      raise exception 'running execution heartbeat may only update its lease and timestamp'
        using errcode = '55000';
    end if;
  elsif old.status = 'running' and new.status not in ('completed', 'failed') then
    raise exception 'invalid engine execution transition from running'
      using errcode = '55000';
  end if;
  if old.status = 'running' and new.started_at is distinct from old.started_at then
    raise exception 'engine execution start timestamp is immutable once running'
      using errcode = '55000';
  end if;
  if new.updated_at < old.updated_at then
    raise exception 'engine execution updated_at cannot move backwards'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_engine_execution_update() from public, anon, authenticated;

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
