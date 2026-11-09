-- Make culture generation safe to retry after an unknown client outcome.
-- The existing RPC remains the single implementation of the biological writes;
-- this wrapper adds a durable receipt in the same PostgreSQL transaction.
create or replace function public.create_culture_with_generation_idempotent(
  p_organization_id uuid,
  p_idempotency_key uuid,
  p_code text,
  p_culture_type text,
  p_parent_material_id uuid,
  p_parent_culture_id uuid default null,
  p_protocol_version_id uuid default null,
  p_environment_id uuid default null,
  p_experiment_id uuid default null,
  p_experimental_unit_id uuid default null,
  p_started_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor_id uuid := auth.uid();
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
  if not private.is_org_writer(p_organization_id) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.culture_data_consents c
     where c.organization_id = p_organization_id
       and c.user_id = v_actor_id
       and c.terms_version = '2026-10-09-v1'
       and c.terms_accepted_at is not null
  ) then
    raise exception 'batchtracker_terms_acceptance_required' using errcode = '42501';
  end if;

  v_request_payload := jsonb_build_object(
    'organization_id', p_organization_id,
    'code', p_code,
    'culture_type', p_culture_type,
    'parent_material_id', p_parent_material_id,
    'parent_culture_id', p_parent_culture_id,
    'protocol_version_id', p_protocol_version_id,
    'environment_id', p_environment_id,
    'experiment_id', p_experiment_id,
    'experimental_unit_id', p_experimental_unit_id,
    'started_at', p_started_at,
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  );

  insert into private.operation_idempotency_receipts (
    organization_id, actor_user_id, operation_name, idempotency_key, request_payload
  ) values (
    p_organization_id, v_actor_id, 'create_culture_with_generation',
    p_idempotency_key, v_request_payload
  )
  on conflict (organization_id, actor_user_id, operation_name, idempotency_key)
  do nothing;

  if not found then
    select r.request_payload, r.response_payload
      into v_cached_request, v_cached_response
      from private.operation_idempotency_receipts r
     where r.organization_id = p_organization_id
       and r.actor_user_id = v_actor_id
       and r.operation_name = 'create_culture_with_generation'
       and r.idempotency_key = p_idempotency_key
     for update;

    if v_cached_request is distinct from v_request_payload then
      raise exception 'idempotency_key_reused_with_different_payload'
        using errcode = '22023';
    end if;
    if v_cached_response is null then
      raise exception 'idempotency_result_incomplete' using errcode = '55000';
    end if;
    return v_cached_response;
  end if;

  v_response := public.create_culture_with_generation(
    p_organization_id,
    p_code,
    p_culture_type,
    p_parent_material_id,
    p_parent_culture_id,
    p_protocol_version_id,
    p_environment_id,
    p_experiment_id,
    p_experimental_unit_id,
    p_started_at,
    coalesce(p_metadata, '{}'::jsonb)
  );

  update private.operation_idempotency_receipts
     set response_payload = v_response
   where organization_id = p_organization_id
     and actor_user_id = v_actor_id
     and operation_name = 'create_culture_with_generation'
     and idempotency_key = p_idempotency_key;

  return v_response;
end;
$function$;

revoke all on function public.create_culture_with_generation_idempotent(
  uuid, uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.create_culture_with_generation_idempotent(
  uuid, uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb
) to authenticated;

-- Prevent the client from bypassing the idempotent entry point.
revoke all on function public.create_culture_with_generation(
  uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb
) from public, anon, authenticated;
