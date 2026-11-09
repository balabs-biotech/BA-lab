-- Durable idempotency receipts for biological operations.
-- The receipt and all biological writes commit or roll back in the same transaction.
create table private.operation_idempotency_receipts (
  organization_id uuid not null references public.organizations(id),
  actor_user_id uuid not null references auth.users(id),
  operation_name text not null,
  idempotency_key uuid not null,
  request_payload jsonb not null,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  primary key (organization_id, actor_user_id, operation_name, idempotency_key)
);

alter table private.operation_idempotency_receipts enable row level security;
revoke all on table private.operation_idempotency_receipts from public, anon, authenticated;

-- Traçabilité biologique de bout en bout : opérations et descendants atomiques.
create or replace function public.record_biological_operation(
  p_organization_id uuid,
  p_parent_culture_id uuid,
  p_event_type text,
  p_idempotency_key uuid,
  p_occurred_at timestamptz default now(),
  p_note text default null,
  p_details jsonb default '{}'::jsonb,
  p_child_codes text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_parent public.cultures%rowtype;
  v_parent_material public.materials%rowtype;
  v_child_material public.materials%rowtype;
  v_child public.cultures%rowtype;
  v_event_id uuid;
  v_code text;
  v_material_code text;
  v_generation integer;
  v_children jsonb := '[]'::jsonb;
  v_seen text[] := array[]::text[];
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
  if p_event_type is null or p_event_type not in ('repiquage','transfert','division_aliquotes','changement_milieu','contamination_suspectee','conservation','resultat_final','passage','autre_operation') then
    raise exception 'unsupported_biological_operation';
  end if;
  if coalesce(array_length(p_child_codes,1),0) > 12 then
    raise exception 'too_many_descendants';
  end if;

  v_request_payload := jsonb_build_object(
    'organization_id', p_organization_id,
    'parent_culture_id', p_parent_culture_id,
    'event_type', p_event_type,
    'occurred_at', p_occurred_at,
    'note', p_note,
    'details', coalesce(p_details, '{}'::jsonb),
    'child_codes', coalesce(to_jsonb(p_child_codes), '[]'::jsonb)
  );

  insert into private.operation_idempotency_receipts (
    organization_id, actor_user_id, operation_name, idempotency_key, request_payload
  ) values (
    p_organization_id, v_actor_id, 'record_biological_operation', p_idempotency_key, v_request_payload
  ) on conflict (organization_id, actor_user_id, operation_name, idempotency_key) do nothing;

  if not found then
    select r.request_payload, r.response_payload
      into v_cached_request, v_cached_response
      from private.operation_idempotency_receipts r
     where r.organization_id = p_organization_id
       and r.actor_user_id = v_actor_id
       and r.operation_name = 'record_biological_operation'
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
  select * into v_parent from public.cultures
   where organization_id=p_organization_id and id=p_parent_culture_id for update;
  if not found then raise exception 'parent_culture_not_found'; end if;
  select * into v_parent_material from public.materials
   where organization_id=p_organization_id and id=v_parent.material_id for update;
  if not found or v_parent_material.state <> 'active' then
    raise exception 'parent_material_not_active';
  end if;
  if coalesce(array_length(p_child_codes,1),0) > 0 and p_event_type not in ('repiquage','transfert','division_aliquotes','passage','conservation','changement_milieu') then
    raise exception 'this_operation_cannot_create_descendants';
  end if;
  foreach v_code in array coalesce(p_child_codes,array[]::text[]) loop
    v_code := btrim(v_code);
    if v_code = '' or v_code = any(v_seen) then raise exception 'child_codes_must_be_unique_and_nonempty'; end if;
    if exists (select 1 from public.cultures where organization_id=p_organization_id and code=v_code) then
      raise exception 'culture_code_already_exists: %', v_code;
    end if;
    v_seen := array_append(v_seen,v_code);
  end loop;
  v_generation := coalesce(v_parent_material.generation,0) + 1;
  insert into public.events(organization_id,event_type,occurred_at,actor_user_id,culture_id,payload)
  values (p_organization_id,p_event_type,coalesce(p_occurred_at,now()),auth.uid(),v_parent.id,
    jsonb_build_object('operation','biological_traceability','parent_culture_id',v_parent.id,
      'parent_culture_code',v_parent.code,'parent_material_id',v_parent_material.id,
      'note',nullif(btrim(coalesce(p_note,'')),''),'details',coalesce(p_details,'{}'::jsonb),
      'child_codes',to_jsonb(v_seen))) returning id into v_event_id;
  foreach v_code in array v_seen loop
    v_material_code := 'MAT-' || regexp_replace(upper(v_code),'[^A-Z0-9_-]+','-','g');
    while exists (select 1 from public.materials where organization_id=p_organization_id and material_code=v_material_code) loop
      v_material_code := v_material_code || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    end loop;
    insert into public.materials(organization_id,material_code,material_type,strain_id,parent_material_id,state,generation,metadata)
    values (p_organization_id,v_material_code,'culture_derived',v_parent_material.strain_id,v_parent_material.id,'active',v_generation,
      jsonb_build_object('generation_method',p_event_type,'source_event_id',v_event_id,'parent_culture_code',v_parent.code))
    returning * into v_child_material;
    insert into public.material_relationships(organization_id,parent_material_id,child_material_id,relationship_type)
    values (p_organization_id,v_parent_material.id,v_child_material.id,p_event_type)
    on conflict (organization_id,parent_material_id,child_material_id,relationship_type) do nothing;
    insert into public.cultures(organization_id,code,culture_type,material_id,parent_culture_id,started_at,metadata)
    values (p_organization_id,v_code,v_parent.culture_type,v_child_material.id,v_parent.id,coalesce(p_occurred_at,now()),
      jsonb_build_object('generation',v_generation,'created_by_operation',p_event_type,'source_event_id',v_event_id))
    returning * into v_child;
    insert into public.events(organization_id,event_type,occurred_at,actor_user_id,culture_id,payload)
    values (p_organization_id,'descendant_created',coalesce(p_occurred_at,now()),auth.uid(),v_child.id,
      jsonb_build_object('operation_event_id',v_event_id,'operation_type',p_event_type,
        'parent_culture_id',v_parent.id,'parent_culture_code',v_parent.code,'parent_material_id',v_parent_material.id,
        'material_id',v_child_material.id,'material_code',v_child_material.material_code,'generation',v_generation,
        'note',nullif(btrim(coalesce(p_note,'')),'')));
    v_children := v_children || jsonb_build_array(jsonb_build_object('id',v_child.id,'code',v_child.code,
      'material_id',v_child_material.id,'material_code',v_child_material.material_code,'generation',v_generation));
  end loop;
  v_response := jsonb_build_object('event_id',v_event_id,'parent_culture_id',v_parent.id,
    'parent_culture_code',v_parent.code,'event_type',p_event_type,'children',v_children);

  update private.operation_idempotency_receipts
     set response_payload = v_response
   where organization_id = p_organization_id
     and actor_user_id = v_actor_id
     and operation_name = 'record_biological_operation'
     and idempotency_key = p_idempotency_key;

  return v_response;
end;
$function$;
revoke all on function public.record_biological_operation(uuid,uuid,text,timestamptz,text,jsonb,text[]) from public, anon, authenticated;
revoke all on function public.record_biological_operation(uuid,uuid,text,uuid,timestamptz,text,jsonb,text[]) from public, anon;
grant execute on function public.record_biological_operation(uuid,uuid,text,uuid,timestamptz,text,jsonb,text[]) to authenticated;
