-- Atomic experiment setup: one experiment and its complete set of experimental units.
-- Scientific setup is created through this RPC; client roles retain read-only table access.

create or replace function public.create_experiment_with_units(
  p_organization_id uuid,
  p_code text,
  p_name text,
  p_design jsonb,
  p_units jsonb,
  p_idempotency_key uuid,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_experiment_id uuid;
  v_experiment_code text := btrim(coalesce(p_code, ''));
  v_experiment_name text := btrim(coalesce(p_name, ''));
  v_design jsonb := coalesce(p_design, '{}'::jsonb);
  v_unit jsonb;
  v_unit_code text;
  v_treatment_code text;
  v_replicate_text text;
  v_replicate_no integer;
  v_metadata jsonb;
  v_unit_id uuid;
  v_units jsonb := '[]'::jsonb;
  v_seen_codes text[] := array[]::text[];
  v_request_payload jsonb;
  v_cached_request jsonb;
  v_cached_response jsonb;
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  if p_organization_id is null or not private.is_org_writer(p_organization_id) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;
  if p_occurred_at is null then
    raise exception 'experiment_timestamp_required' using errcode = '22023';
  end if;
  if v_experiment_code = '' or length(v_experiment_code) > 120 then
    raise exception 'experiment_code_invalid' using errcode = '22023';
  end if;
  if v_experiment_name = '' or length(v_experiment_name) > 200 then
    raise exception 'experiment_name_invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(v_design) <> 'object' then
    raise exception 'experiment_design_must_be_json_object' using errcode = '22023';
  end if;
  if p_units is null or jsonb_typeof(p_units) <> 'array' then
    raise exception 'experiment_units_must_be_json_array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_units) < 1 then
    raise exception 'experiment_units_required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_units) > 200 then
    raise exception 'experiment_unit_limit_exceeded' using errcode = '22023';
  end if;

  v_request_payload := jsonb_build_object(
    'organization_id', p_organization_id,
    'code', v_experiment_code,
    'name', v_experiment_name,
    'design', v_design,
    'units', p_units,
    'occurred_at', p_occurred_at
  );
  if octet_length(v_request_payload::text) > 262144 then
    raise exception 'experiment_setup_payload_too_large' using errcode = '22023';
  end if;

  insert into private.operation_idempotency_receipts (
    organization_id, actor_user_id, operation_name, idempotency_key, request_payload
  ) values (
    p_organization_id, v_actor_id, 'create_experiment_with_units',
    p_idempotency_key, v_request_payload
  ) on conflict (organization_id, actor_user_id, operation_name, idempotency_key) do nothing;

  if not found then
    select r.request_payload, r.response_payload
      into v_cached_request, v_cached_response
      from private.operation_idempotency_receipts r
     where r.organization_id = p_organization_id
       and r.actor_user_id = v_actor_id
       and r.operation_name = 'create_experiment_with_units'
       and r.idempotency_key = p_idempotency_key
     for update;

    if v_cached_request is distinct from v_request_payload then
      raise exception 'idempotency_key_reused_with_different_payload' using errcode = '22023';
    end if;
    if v_cached_response is null then
      raise exception 'idempotency_result_incomplete' using errcode = '55000';
    end if;
    return v_cached_response;
  end if;

  if exists (
    select 1 from public.experiments e
     where e.organization_id = p_organization_id
       and e.code = v_experiment_code
  ) then
    raise exception 'experiment_code_already_exists' using errcode = '23505';
  end if;

  for v_unit in select value from jsonb_array_elements(p_units)
  loop
    if jsonb_typeof(v_unit) <> 'object' then
      raise exception 'experimental_unit_must_be_json_object' using errcode = '22023';
    end if;

    v_unit_code := btrim(coalesce(v_unit->>'unit_code', ''));
    if v_unit_code = '' or length(v_unit_code) > 120 then
      raise exception 'experimental_unit_code_invalid' using errcode = '22023';
    end if;
    if v_unit_code = any(v_seen_codes) then
      raise exception 'experimental_unit_codes_must_be_unique' using errcode = '22023';
    end if;
    v_seen_codes := array_append(v_seen_codes, v_unit_code);

    v_treatment_code := nullif(btrim(coalesce(v_unit->>'treatment_code', '')), '');
    if v_treatment_code is not null and length(v_treatment_code) > 120 then
      raise exception 'experimental_unit_treatment_code_invalid' using errcode = '22023';
    end if;

    v_replicate_text := nullif(btrim(coalesce(v_unit->>'replicate_no', '')), '');
    v_replicate_no := null;
    if v_replicate_text is not null then
      if v_replicate_text !~ '^[1-9][0-9]*$' then
        raise exception 'experimental_unit_replicate_no_invalid' using errcode = '22023';
      end if;
      begin
        v_replicate_no := v_replicate_text::integer;
      exception when numeric_value_out_of_range then
        raise exception 'experimental_unit_replicate_no_invalid' using errcode = '22023';
      end;
    end if;

    v_metadata := coalesce(v_unit->'metadata', '{}'::jsonb);
    if jsonb_typeof(v_metadata) <> 'object' then
      raise exception 'experimental_unit_metadata_must_be_json_object' using errcode = '22023';
    end if;
  end loop;

  insert into public.experiments (
    organization_id, code, name, design
  ) values (
    p_organization_id, v_experiment_code, v_experiment_name, v_design
  ) returning id into v_experiment_id;

  insert into public.provenance (
    organization_id, target_type, target_id, action, actor_user_id,
    occurred_at, source_type, source_id, method, context
  ) values (
    p_organization_id, 'experiment', v_experiment_id, 'created', v_actor_id,
    p_occurred_at, 'cultureops', v_experiment_id::text,
    'create_experiment_with_units',
    jsonb_build_object(
      'code', v_experiment_code,
      'name', v_experiment_name,
      'design', v_design,
      'unit_count', jsonb_array_length(p_units)
    )
  );

  for v_unit in select value from jsonb_array_elements(p_units)
  loop
    v_unit_code := btrim(v_unit->>'unit_code');
    v_treatment_code := nullif(btrim(coalesce(v_unit->>'treatment_code', '')), '');
    v_replicate_text := nullif(btrim(coalesce(v_unit->>'replicate_no', '')), '');
    v_replicate_no := case when v_replicate_text is null then null else v_replicate_text::integer end;
    v_metadata := coalesce(v_unit->'metadata', '{}'::jsonb);

    insert into public.experimental_units (
      organization_id, experiment_id, unit_code, replicate_no, treatment_code, metadata
    ) values (
      p_organization_id, v_experiment_id, v_unit_code,
      v_replicate_no, v_treatment_code, v_metadata
    ) returning id into v_unit_id;

    insert into public.events (
      organization_id, event_type, occurred_at, actor_user_id,
      experimental_unit_id, payload
    ) values (
      p_organization_id, 'experimental_unit_created', p_occurred_at, v_actor_id,
      v_unit_id,
      jsonb_build_object(
        'experiment_id', v_experiment_id,
        'experiment_code', v_experiment_code,
        'unit_code', v_unit_code,
        'replicate_no', v_replicate_no,
        'treatment_code', v_treatment_code
      )
    );

    v_units := v_units || jsonb_build_array(jsonb_build_object(
      'id', v_unit_id,
      'unit_code', v_unit_code,
      'replicate_no', v_replicate_no,
      'treatment_code', v_treatment_code
    ));
  end loop;

  v_response := jsonb_build_object(
    'experiment_id', v_experiment_id,
    'organization_id', p_organization_id,
    'code', v_experiment_code,
    'name', v_experiment_name,
    'unit_count', jsonb_array_length(p_units),
    'units', v_units
  );

  update private.operation_idempotency_receipts
     set response_payload = v_response
   where organization_id = p_organization_id
     and actor_user_id = v_actor_id
     and operation_name = 'create_experiment_with_units'
     and idempotency_key = p_idempotency_key;

  return v_response;
end;
$function$;

revoke all on function public.create_experiment_with_units(
  uuid, text, text, jsonb, jsonb, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_experiment_with_units(
  uuid, text, text, jsonb, jsonb, uuid, timestamptz
) to authenticated;

-- Experiment setup is an atomic scientific record, not a client-side CRUD surface.
revoke insert, update, delete, truncate
  on table public.experiments, public.experimental_units
  from public, anon, authenticated;
grant select on table public.experiments, public.experimental_units to authenticated;

-- Provenance is an audit record, not a client-editable annotation.
revoke insert, update, delete, truncate
  on table public.provenance
  from public, anon, authenticated;
grant select on table public.provenance to authenticated;
