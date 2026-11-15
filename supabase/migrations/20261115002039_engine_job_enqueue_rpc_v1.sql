
create or replace function public.enqueue_engine_job(
  p_organization_id uuid,
  p_engine_code text,
  p_contract_version text,
  p_payload jsonb,
  p_idempotency_key text default null,
  p_priority smallint default 0,
  p_correlation_id uuid default null,
  p_parent_job_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_engine public.engine_registry%rowtype;
  v_job_id uuid;
  v_existing public.engine_jobs%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.is_org_writer(p_organization_id) then
    raise exception 'organization_write_access_required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload_must_be_json_object' using errcode = '22023';
  end if;
  if p_idempotency_key is not null and length(p_idempotency_key) > 200 then
    raise exception 'idempotency_key_too_long' using errcode = '22023';
  end if;
  if p_priority is null or p_priority < -100 or p_priority > 100 then
    raise exception 'priority_out_of_range' using errcode = '22023';
  end if;

  select * into v_engine
  from public.engine_registry e
  where e.engine_code = p_engine_code
    and (e.organization_id is null or e.organization_id = p_organization_id)
  order by (e.organization_id is not null) desc
  limit 1;

  if not found or v_engine.status <> 'active' then
    raise exception 'engine_not_active_or_not_found' using errcode = '22023';
  end if;
  if v_engine.contract_version <> p_contract_version then
    raise exception 'engine_contract_version_mismatch' using errcode = '22023';
  end if;

  insert into public.engine_jobs(
    organization_id, engine_code, contract_version, payload, idempotency_key,
    status, priority, max_attempts, created_by, correlation_id, parent_job_id
  ) values (
    p_organization_id, p_engine_code, p_contract_version, p_payload, p_idempotency_key,
    'queued', p_priority, v_engine.max_attempts, v_user_id, p_correlation_id, p_parent_job_id
  )
  on conflict (organization_id, idempotency_key) do nothing
  returning id into v_job_id;

  if v_job_id is not null then
    return v_job_id;
  end if;

  if p_idempotency_key is null then
    raise exception 'job_insert_failed' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.engine_jobs j
  where j.organization_id = p_organization_id
    and j.idempotency_key = p_idempotency_key;

  if not found then
    raise exception 'idempotency_conflict_retry' using errcode = '40001';
  end if;
  if v_existing.engine_code <> p_engine_code
     or v_existing.contract_version <> p_contract_version
     or v_existing.payload <> p_payload then
    raise exception 'idempotency_key_reused_with_different_request' using errcode = '22023';
  end if;

  return v_existing.id;
end;
$$;

revoke all on function public.enqueue_engine_job(uuid,text,text,jsonb,text,smallint,uuid,uuid) from public, anon;
grant execute on function public.enqueue_engine_job(uuid,text,text,jsonb,text,smallint,uuid,uuid) to authenticated;
;
