-- Atomic, idempotent structured experimental-result recording.
-- A result belongs to an experimental unit; its experiment is derived from that unit
-- so the two provenance references cannot disagree.
alter table public.results add column event_id uuid;
alter table public.results add constraint results_event_fk
  foreign key (organization_id,event_id) references public.events(organization_id,id);
create or replace function public.record_experiment_result(
  p_organization_id uuid,
  p_experimental_unit_id uuid,
  p_code text,
  p_result_type text,
  p_value jsonb,
  p_quality_state text,
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
  v_result_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_quality_state public.quality_state;
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
  if p_experimental_unit_id is null then
    raise exception 'experimental_unit_required' using errcode = '22023';
  end if;
  if p_occurred_at is null then
    raise exception 'experimental_result_timestamp_required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_code,'')),'') is null or length(btrim(p_code)) > 120 then
    raise exception 'experimental_result_code_invalid' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_result_type,'')),'') is null or length(btrim(p_result_type)) > 100 then
    raise exception 'experimental_result_type_invalid' using errcode = '22023';
  end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'experimental_result_value_must_be_json_object' using errcode = '22023';
  end if;
  begin
    v_quality_state := coalesce(nullif(p_quality_state,''),'raw')::public.quality_state;
  exception when invalid_text_representation then
    raise exception 'experimental_result_quality_state_invalid' using errcode = '22023';
  end;

  select eu.experiment_id
    into v_experiment_id
    from public.experimental_units eu
   where eu.organization_id = p_organization_id
     and eu.id = p_experimental_unit_id
   for key share;
  if not found then
    raise exception 'experimental_unit_not_found' using errcode = '22023';
  end if;

  v_request_payload := jsonb_build_object(
    'organization_id',p_organization_id,
    'experimental_unit_id',p_experimental_unit_id,
    'experiment_id',v_experiment_id,
    'code',btrim(p_code),
    'result_type',btrim(p_result_type),
    'value',p_value,
    'quality_state',v_quality_state::text,
    'occurred_at',p_occurred_at
  );

  insert into private.operation_idempotency_receipts(
    organization_id,actor_user_id,operation_name,idempotency_key,request_payload
  ) values (
    p_organization_id,v_actor_id,'record_experiment_result',p_idempotency_key,v_request_payload
  ) on conflict (organization_id,actor_user_id,operation_name,idempotency_key) do nothing;

  if not found then
    select r.request_payload,r.response_payload
      into v_cached_request,v_cached_response
      from private.operation_idempotency_receipts r
     where r.organization_id=p_organization_id
       and r.actor_user_id=v_actor_id
       and r.operation_name='record_experiment_result'
       and r.idempotency_key=p_idempotency_key
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
    select 1 from public.results r
     where r.organization_id=p_organization_id
       and r.code=btrim(p_code)
  ) then
    raise exception 'experimental_result_code_already_exists' using errcode = '23505';
  end if;

  insert into public.events(
    organization_id,event_type,occurred_at,actor_user_id,experimental_unit_id,payload
  ) values (
    p_organization_id,'experiment_result_recorded',p_occurred_at,
    v_actor_id,p_experimental_unit_id,
    jsonb_build_object(
      'result_id',v_result_id,
      'result_code',btrim(p_code),
      'result_type',btrim(p_result_type),
      'quality_state',v_quality_state::text
    )
  ) returning id into v_event_id;

  insert into public.results(
    id,organization_id,experiment_id,experimental_unit_id,event_id,code,result_type,value,quality_state
  ) values (
    v_result_id,p_organization_id,v_experiment_id,p_experimental_unit_id,v_event_id,
    btrim(p_code),btrim(p_result_type),p_value,v_quality_state
  );

  v_response := jsonb_build_object(
    'result_id',v_result_id,
    'event_id',v_event_id,
    'organization_id',p_organization_id,
    'experiment_id',v_experiment_id,
    'experimental_unit_id',p_experimental_unit_id,
    'code',btrim(p_code),
    'result_type',btrim(p_result_type),
    'quality_state',v_quality_state::text
  );

  update private.operation_idempotency_receipts
     set response_payload=v_response
   where organization_id=p_organization_id
     and actor_user_id=v_actor_id
     and operation_name='record_experiment_result'
     and idempotency_key=p_idempotency_key;

  return v_response;
end;
$function$;

revoke all on function public.record_experiment_result(
  uuid,uuid,text,text,jsonb,text,uuid,timestamptz
) from public,anon,authenticated;
grant execute on function public.record_experiment_result(
  uuid,uuid,text,text,jsonb,text,uuid,timestamptz
) to authenticated;

-- Result rows are scientific records. All client writes must pass through the
-- validated RPC; corrections will require an explicit append-only correction model.
alter table public.results enable row level security;
revoke insert,update,delete,truncate on table public.results from public,anon,authenticated;
