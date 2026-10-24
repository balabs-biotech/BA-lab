-- Atomic client-facing writes for manual measurements and observations.
-- Each RPC inserts the traceability event and its data row in one PostgreSQL transaction.
create or replace function public.record_manual_measurement(
  p_event jsonb,
  p_measurement jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_org_id uuid;
begin
  v_org_id := nullif(p_event->>'organization_id', '')::uuid;

  if v_org_id is null or not private.is_org_member(v_org_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;

  if p_event is null or p_measurement is null then
    raise exception 'Event and measurement payloads are required' using errcode = '22023';
  end if;

  insert into public.events (
    organization_id, event_type, occurred_at, actor_user_id,
    culture_id, plant_culture_id, environment_id, location_id, batch_id, payload
  ) values (
    v_org_id,
    p_event->>'event_type',
    coalesce(nullif(p_event->>'occurred_at', '')::timestamptz, now()),
    nullif(p_event->>'actor_user_id', '')::uuid,
    nullif(p_event->>'culture_id', '')::uuid,
    nullif(p_event->>'plant_culture_id', '')::uuid,
    nullif(p_event->>'environment_id', '')::uuid,
    nullif(p_event->>'location_id', '')::uuid,
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
    nullif(p_measurement->>'environment_id', '')::uuid,
    v_event_id,
    coalesce(p_measurement->'metadata', '{}'::jsonb)
  );

  return v_event_id;
end;
$$;

create or replace function public.record_manual_observation(
  p_event jsonb,
  p_observation jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_org_id uuid;
begin
  v_org_id := nullif(p_event->>'organization_id', '')::uuid;

  if v_org_id is null or not private.is_org_member(v_org_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;

  if p_event is null or p_observation is null then
    raise exception 'Event and observation payloads are required' using errcode = '22023';
  end if;

  insert into public.events (
    organization_id, event_type, occurred_at, actor_user_id,
    culture_id, plant_culture_id, environment_id, location_id, batch_id, payload
  ) values (
    v_org_id,
    p_event->>'event_type',
    coalesce(nullif(p_event->>'occurred_at', '')::timestamptz, now()),
    nullif(p_event->>'actor_user_id', '')::uuid,
    nullif(p_event->>'culture_id', '')::uuid,
    nullif(p_event->>'plant_culture_id', '')::uuid,
    nullif(p_event->>'environment_id', '')::uuid,
    nullif(p_event->>'location_id', '')::uuid,
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

  return v_event_id;
end;
$$;

revoke all on function public.record_manual_measurement(jsonb, jsonb) from public, anon;
revoke all on function public.record_manual_observation(jsonb, jsonb) from public, anon;
grant execute on function public.record_manual_measurement(jsonb, jsonb) to authenticated;
grant execute on function public.record_manual_observation(jsonb, jsonb) to authenticated;
