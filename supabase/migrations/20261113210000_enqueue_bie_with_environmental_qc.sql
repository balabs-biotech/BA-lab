-- Atomically enqueue a BIE v0.2 execution with its verified environmental QC lineage.
-- The request carries the bounded immutable artifact; execution and dependency
-- creation share one transaction so a queue worker cannot claim it in between.
create or replace function public.enqueue_bie_with_environmental_qc(
  p_organization_id uuid,
  p_request_id uuid,
  p_idempotency_key text,
  p_scope jsonb,
  p_input_record_ids uuid[],
  p_input_snapshot_sha256 text,
  p_request_payload jsonb,
  p_requested_by uuid,
  p_upstream_execution_id uuid
)
returns table(execution_id uuid, upstream_result_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_execution_id uuid;
  v_result_id uuid;
  v_artifact jsonb;
  v_result public.engine_execution_results%rowtype;
begin
  if p_organization_id is null or p_request_id is null
    or p_upstream_execution_id is null
    or p_idempotency_key is null
    or length(btrim(p_idempotency_key)) not between 8 and 160
    or jsonb_typeof(p_scope) is distinct from 'object'
    or jsonb_typeof(p_request_payload) is distinct from 'object'
    or p_input_snapshot_sha256 is null
    or p_input_snapshot_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid BIE enqueue arguments' using errcode = '22023';
  end if;

  if p_request_payload->'engine'->>'engine_id' is distinct from 'biological.context.features'
    or p_request_payload->'engine'->>'engine_version' is distinct from '0.2.0'
    or p_request_payload->>'request_id' is distinct from p_request_id::text
    or p_request_payload->'scope' is distinct from p_scope
    or p_request_payload->'input'->>'snapshot_sha256' is distinct from p_input_snapshot_sha256 then
    raise exception 'BIE request envelope does not match enqueue identity' using errcode = '22023';
  end if;

  if jsonb_typeof(p_request_payload->'upstream_artifacts') is distinct from 'array' then
    raise exception 'exactly one environmental QC artifact is required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_request_payload->'upstream_artifacts') <> 1 then
    raise exception 'exactly one environmental QC artifact is required' using errcode = '22023';
  end if;
  v_artifact := p_request_payload->'upstream_artifacts'->0;

  select * into v_result
  from public.engine_execution_results
  where organization_id = p_organization_id
    and execution_id = p_upstream_execution_id;

  if not found then
    raise exception 'upstream QC result is unavailable' using errcode = '22023';
  end if;

  if v_artifact->>'contract' is distinct from 'BA-LABS/UPSTREAM-ENGINE-ARTIFACT'
    or v_artifact->>'contract_version' is distinct from '1.0.0'
    or v_artifact->>'role' is distinct from 'environmental_qc'
    or v_artifact->>'execution_id' is distinct from p_upstream_execution_id::text
    or v_artifact->>'request_id' is distinct from (
      select request_id::text from public.engine_executions
      where organization_id = p_organization_id and id = p_upstream_execution_id
    )
    or v_artifact->>'result_id' is distinct from v_result.id::text
    or v_artifact->>'engine_id' is distinct from v_result.engine_id
    or v_artifact->>'engine_version' is distinct from v_result.engine_version
    or v_artifact->>'input_snapshot_sha256' is distinct from v_result.input_snapshot_sha256
    or v_artifact->'scope'->>'organization_id' is distinct from p_organization_id::text
    or v_artifact->'scope'->>'location_id' is distinct from p_scope->>'location_id'
    or v_artifact->'scope'->>'window_start' is distinct from p_request_payload->'parameters'->>'window_start'
    or v_artifact->'scope'->>'window_end' is distinct from p_request_payload->'parameters'->>'window_end'
    or v_artifact->'result' is distinct from jsonb_build_object(
      'outcome', v_result.outcome,
      'value', v_result.value,
      'limitations', v_result.limitations,
      'quality_flags', v_result.quality_flags,
      'provenance', v_result.provenance
    ) then
    raise exception 'QC artifact does not match the immutable upstream result row'
      using errcode = '22023';
  end if;

  insert into public.engine_executions(
    organization_id, request_id, idempotency_key, engine_id, engine_version,
    scope, input_record_ids, input_snapshot_sha256, request_payload, status, requested_by
  ) values (
    p_organization_id, p_request_id, btrim(p_idempotency_key),
    'biological.context.features', '0.2.0',
    p_scope, coalesce(p_input_record_ids, '{}'::uuid[]), p_input_snapshot_sha256,
    p_request_payload, 'queued', p_requested_by
  ) returning id into v_execution_id;

  v_result_id := public.attach_environmental_qc_dependency(
    p_organization_id, v_execution_id, p_upstream_execution_id
  );

  return query select v_execution_id, v_result_id;
end;
$$;

revoke all on function public.enqueue_bie_with_environmental_qc(uuid,uuid,text,jsonb,uuid[],text,jsonb,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.enqueue_bie_with_environmental_qc(uuid,uuid,text,jsonb,uuid[],text,jsonb,uuid,uuid)
  to service_role;

comment on function public.enqueue_bie_with_environmental_qc(uuid,uuid,text,jsonb,uuid[],text,jsonb,uuid,uuid) is
  'Atomically creates a BIE v0.2 queue item and its fixed environmental QC dependency after matching the artifact to the immutable upstream result row.';
