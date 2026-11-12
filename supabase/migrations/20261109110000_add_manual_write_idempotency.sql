-- Idempotent retries for atomic manual measurement and observation writes.
-- The receipt, event and scientific record commit or roll back in the same transaction.
create or replace function public.record_manual_measurement(
  p_event jsonb,
  p_measurement jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event_id uuid;
  v_org_id uuid;
  v_material_id uuid;
  v_batch_culture_id uuid;
  v_batch_material_id uuid;
  v_batch_location_id uuid;
  v_batch_environment_id uuid;
  v_actor_id uuid := auth.uid();
  v_request_payload jsonb;
  v_cached_request jsonb;
  v_cached_response jsonb;
begin
  v_org_id := nullif(p_event->>'organization_id', '')::uuid;

  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  if v_org_id is null or not private.is_org_writer(v_org_id) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  if p_event is null or p_measurement is null then
    raise exception 'Event and measurement payloads are required' using errcode = '22023';
  end if;
  if p_event->>'event_type' <> 'measurement_recorded' then
    raise exception 'Unsupported manual measurement event type' using errcode = '22023';
  end if;
  if nullif(p_event->>'culture_id', '')::uuid is distinct from nullif(p_measurement->>'culture_id', '')::uuid
     or nullif(p_event->>'plant_culture_id', '')::uuid is distinct from nullif(p_measurement->>'plant_culture_id', '')::uuid then
    raise exception 'Event and measurement targets must match' using errcode = '22023';
  end if;

  if nullif(p_event->>'environment_id', '')::uuid is not null
     and nullif(p_measurement->>'environment_id', '')::uuid is not null
     and nullif(p_event->>'environment_id', '')::uuid is distinct from nullif(p_measurement->>'environment_id', '')::uuid then
    raise exception 'Event and measurement environments must match' using errcode = '22023';
  end if;

  if nullif(p_event->>'batch_id', '') is not null then
    select b.culture_id, b.material_id, b.location_id, b.environment_id
      into v_batch_culture_id, v_batch_material_id, v_batch_location_id, v_batch_environment_id
      from public.batches b
     where b.organization_id = v_org_id
       and b.id = nullif(p_event->>'batch_id', '')::uuid;
    if not found then raise exception 'Batch not found in organization' using errcode = '22023'; end if;
    if nullif(p_event->>'culture_id', '')::uuid is distinct from v_batch_culture_id then
      raise exception 'Event culture does not match batch culture' using errcode = '22023';
    end if;
    if v_batch_culture_id is null and v_batch_material_id is null then
      raise exception 'Batch needs a culture or material anchor for traceability' using errcode = '22023';
    end if;
    v_material_id := case when v_batch_culture_id is null then v_batch_material_id else null end;
  end if;

  v_request_payload := jsonb_build_object(
    'event', p_event,
    'measurement', p_measurement
  );

  insert into private.operation_idempotency_receipts (
    organization_id, actor_user_id, operation_name, idempotency_key, request_payload
  ) values (
    v_org_id, v_actor_id, 'record_manual_measurement', p_idempotency_key, v_request_payload
  ) on conflict (organization_id, actor_user_id, operation_name, idempotency_key) do nothing;

  if not found then
    select r.request_payload, r.response_payload
      into v_cached_request, v_cached_response
      from private.operation_idempotency_receipts r
     where r.organization_id = v_org_id
       and r.actor_user_id = v_actor_id
       and r.operation_name = 'record_manual_measurement'
       and r.idempotency_key = p_idempotency_key
     for update;

    if v_cached_request is distinct from v_request_payload then
      raise exception 'idempotency_key_reused_with_different_payload' using errcode = '22023';
    end if;
    if v_cached_response is null then
      raise exception 'idempotency_result_incomplete' using errcode = '55000';
    end if;
    return (v_cached_response->>'event_id')::uuid;
  end if;

  insert into public.events (
    organization_id, event_type, occurred_at, actor_user_id,
    culture_id, material_id, plant_culture_id, environment_id, location_id, batch_id, payload
  ) values (
    v_org_id,
    p_event->>'event_type',
    coalesce(nullif(p_event->>'occurred_at', '')::timestamptz, now()),
    auth.uid(),
    nullif(p_event->>'culture_id', '')::uuid,
    v_material_id,
    nullif(p_event->>'plant_culture_id', '')::uuid,
    coalesce(nullif(p_event->>'environment_id', '')::uuid, nullif(p_measurement->>'environment_id', '')::uuid, v_batch_environment_id),
    coalesce(nullif(p_event->>'location_id', '')::uuid, v_batch_location_id),
    nullif(p_event->>'batch_id', '')::uuid,
    coalesce(p_event->'payload', '{}'::jsonb)
  ) returning id into v_event_id;

  insert into public.measurements (
    organization_id, variable_code, raw_value, raw_unit_code,
    normalized_value, normalized_unit_code, measured_at, method, instrument,
    culture_id, plant_culture_id, environment_id, event_id, metadata
  ) values (
    v_org_id,
    p_measurement->>'variable_code',
    (p_measurement->>'raw_value')::numeric,
    p_measurement->>'raw_unit_code',
    nullif(p_measurement->>'normalized_value', '')::numeric,
    nullif(p_measurement->>'normalized_unit_code', ''),
    coalesce(nullif(p_measurement->>'measured_at', '')::timestamptz, now()),
    nullif(p_measurement->>'method', ''),
    nullif(p_measurement->>'instrument', ''),
    nullif(p_measurement->>'culture_id', '')::uuid,
    nullif(p_measurement->>'plant_culture_id', '')::uuid,
    coalesce(nullif(p_measurement->>'environment_id', '')::uuid, nullif(p_event->>'environment_id', '')::uuid, v_batch_environment_id),
    v_event_id,
    coalesce(p_measurement->'metadata', '{}'::jsonb)
  );

  update private.operation_idempotency_receipts
     set response_payload = jsonb_build_object('event_id', v_event_id)
   where organization_id = v_org_id
     and actor_user_id = v_actor_id
     and operation_name = 'record_manual_measurement'
     and idempotency_key = p_idempotency_key;

  return v_event_id;
end;
$$;

create or replace function public.record_manual_observation(
  p_event jsonb,
  p_observation jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event_id uuid;
  v_org_id uuid;
  v_material_id uuid;
  v_batch_culture_id uuid;
  v_batch_material_id uuid;
  v_batch_location_id uuid;
  v_batch_environment_id uuid;
  v_actor_id uuid := auth.uid();
  v_request_payload jsonb;
  v_cached_request jsonb;
  v_cached_response jsonb;
begin
  v_org_id := nullif(p_event->>'organization_id', '')::uuid;

  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  if v_org_id is null or not private.is_org_writer(v_org_id) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  if p_event is null or p_observation is null then
    raise exception 'Event and observation payloads are required' using errcode = '22023';
  end if;
  if p_event->>'event_type' <> 'observation_recorded' then
    raise exception 'Unsupported manual observation event type' using errcode = '22023';
  end if;
  if nullif(p_event->>'culture_id', '')::uuid is distinct from nullif(p_observation->>'culture_id', '')::uuid
     or nullif(p_event->>'plant_culture_id', '')::uuid is distinct from nullif(p_observation->>'plant_culture_id', '')::uuid then
    raise exception 'Event and observation targets must match' using errcode = '22023';
  end if;

  if nullif(p_event->>'batch_id', '') is not null then
    select b.culture_id, b.material_id, b.location_id, b.environment_id
      into v_batch_culture_id, v_batch_material_id, v_batch_location_id, v_batch_environment_id
      from public.batches b
     where b.organization_id = v_org_id
       and b.id = nullif(p_event->>'batch_id', '')::uuid;
    if not found then raise exception 'Batch not found in organization' using errcode = '22023'; end if;
    if nullif(p_event->>'culture_id', '')::uuid is distinct from v_batch_culture_id then
      raise exception 'Event culture does not match batch culture' using errcode = '22023';
    end if;
    if v_batch_culture_id is null and v_batch_material_id is null then
      raise exception 'Batch needs a culture or material anchor for traceability' using errcode = '22023';
    end if;
    v_material_id := case when v_batch_culture_id is null then v_batch_material_id else null end;
  end if;

  v_request_payload := jsonb_build_object(
    'event', p_event,
    'observation', p_observation
  );

  insert into private.operation_idempotency_receipts (
    organization_id, actor_user_id, operation_name, idempotency_key, request_payload
  ) values (
    v_org_id, v_actor_id, 'record_manual_observation', p_idempotency_key, v_request_payload
  ) on conflict (organization_id, actor_user_id, operation_name, idempotency_key) do nothing;

  if not found then
    select r.request_payload, r.response_payload
      into v_cached_request, v_cached_response
      from private.operation_idempotency_receipts r
     where r.organization_id = v_org_id
       and r.actor_user_id = v_actor_id
       and r.operation_name = 'record_manual_observation'
       and r.idempotency_key = p_idempotency_key
     for update;

    if v_cached_request is distinct from v_request_payload then
      raise exception 'idempotency_key_reused_with_different_payload' using errcode = '22023';
    end if;
    if v_cached_response is null then
      raise exception 'idempotency_result_incomplete' using errcode = '55000';
    end if;
    return (v_cached_response->>'event_id')::uuid;
  end if;

  insert into public.events (
    organization_id, event_type, occurred_at, actor_user_id,
    culture_id, material_id, plant_culture_id, environment_id, location_id, batch_id, payload
  ) values (
    v_org_id,
    p_event->>'event_type',
    coalesce(nullif(p_event->>'occurred_at', '')::timestamptz, now()),
    auth.uid(),
    nullif(p_event->>'culture_id', '')::uuid,
    v_material_id,
    nullif(p_event->>'plant_culture_id', '')::uuid,
    coalesce(nullif(p_event->>'environment_id', '')::uuid, v_batch_environment_id),
    coalesce(nullif(p_event->>'location_id', '')::uuid, v_batch_location_id),
    nullif(p_event->>'batch_id', '')::uuid,
    coalesce(p_event->'payload', '{}'::jsonb)
  ) returning id into v_event_id;

  insert into public.observations (
    organization_id, variable_code, value_text, observed_at,
    culture_id, plant_culture_id, event_id, metadata
  ) values (
    v_org_id,
    p_observation->>'variable_code',
    p_observation->>'value_text',
    coalesce(nullif(p_observation->>'observed_at', '')::timestamptz, now()),
    nullif(p_observation->>'culture_id', '')::uuid,
    nullif(p_observation->>'plant_culture_id', '')::uuid,
    v_event_id,
    coalesce(p_observation->'metadata', '{}'::jsonb)
  );

  update private.operation_idempotency_receipts
     set response_payload = jsonb_build_object('event_id', v_event_id)
   where organization_id = v_org_id
     and actor_user_id = v_actor_id
     and operation_name = 'record_manual_observation'
     and idempotency_key = p_idempotency_key;

  return v_event_id;
end;
$$;

revoke all on function public.record_manual_measurement(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.record_manual_measurement(jsonb, jsonb, uuid) from public, anon;
revoke all on function public.record_manual_observation(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.record_manual_observation(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.record_manual_measurement(jsonb, jsonb, uuid) to authenticated;
grant execute on function public.record_manual_observation(jsonb, jsonb, uuid) to authenticated;
