-- Atomic creation of a multi-source biological material (e.g. a consortium).
-- All source materials, graph edges and the operation event are committed together.
create or replace function public.create_biological_material_mixture(
  p_organization_id uuid,
  p_source_material_ids uuid[],
  p_operation text,
  p_material_code text,
  p_occurred_at timestamptz default now(),
  p_note text default null,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $function$
declare
  v_source_count integer;
  v_source_ids uuid[];
  v_source_materials jsonb;
  v_material public.materials%rowtype;
  v_event_id uuid;
  v_generation integer;
  v_code text := nullif(btrim(coalesce(p_material_code, '')), '');
  v_operation text := nullif(btrim(coalesce(p_operation, '')), '');
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;
  if p_source_material_ids is null or cardinality(p_source_material_ids) < 2
     or array_position(p_source_material_ids, null) is not null then
    raise exception 'material_mixture_requires_multiple_sources';
  end if;
  if cardinality(p_source_material_ids) <>
     (select count(distinct source_id) from unnest(p_source_material_ids) as source_ids(source_id)) then
    raise exception 'material_mixture_sources_must_be_unique';
  end if;
  if v_operation is null or v_code is null then
    raise exception 'material_mixture_operation_and_code_required';
  end if;
  if v_operation not in ('mixing', 'consortium_assembly', 'blending') then
    raise exception 'unsupported_material_mixture_operation';
  end if;

  -- Deterministic lock order prevents deadlocks when concurrent operations share sources.
  perform m.id
    from public.materials m
   where m.organization_id = p_organization_id
     and m.id = any(p_source_material_ids)
   order by m.id
   for update;

  select count(*) into v_source_count
    from public.materials m
   where m.organization_id = p_organization_id
     and m.id = any(p_source_material_ids);
  if v_source_count <> cardinality(p_source_material_ids) then
    raise exception 'material_mixture_source_not_found';
  end if;
  if exists (
    select 1 from public.materials m
     where m.organization_id = p_organization_id
       and m.id = any(p_source_material_ids)
       and m.state <> 'active'
  ) then
    raise exception 'material_mixture_source_not_active';
  end if;
  if exists (
    select 1 from public.materials m
     where m.organization_id = p_organization_id and m.material_code = v_code
  ) then
    raise exception 'material_code_already_exists: %', v_code;
  end if;

  select coalesce(max(m.generation), 0) + 1 into v_generation
    from public.materials m
   where m.organization_id = p_organization_id
     and m.id = any(p_source_material_ids);

  insert into public.materials(
    organization_id, material_code, material_type, strain_id,
    parent_material_id, state, generation, metadata
  )
  values (
    p_organization_id, v_code, 'culture_derived', null,
    null, 'active', v_generation,
    jsonb_build_object(
      'generation_method', v_operation,
      'source_material_ids', to_jsonb(p_source_material_ids),
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'details', coalesce(p_details, '{}'::jsonb)
    )
  )
  returning * into v_material;

  insert into public.material_relationships(
    organization_id, parent_material_id, child_material_id, relationship_type
  )
  select p_organization_id, source_id, v_material.id, v_operation
    from unnest(p_source_material_ids) as source_ids(source_id)
   order by source_id;

  insert into public.events(
    organization_id, event_type, occurred_at, actor_user_id, material_id, payload
  )
  values (
    p_organization_id, v_operation, coalesce(p_occurred_at, now()), auth.uid(), v_material.id,
    jsonb_build_object(
      'operation', v_operation,
      'source_material_ids', to_jsonb(p_source_material_ids),
      'material_code', v_material.material_code,
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'details', coalesce(p_details, '{}'::jsonb)
    )
  )
  returning id into v_event_id;

  select jsonb_agg(jsonb_build_object(
    'id', m.id, 'material_code', m.material_code,
    'material_type', m.material_type, 'strain_id', m.strain_id
  ) order by m.id)
    into v_source_materials
    from public.materials m
   where m.organization_id = p_organization_id
     and m.id = any(p_source_material_ids);

  return jsonb_build_object(
    'material_id', v_material.id,
    'material_code', v_material.material_code,
    'event_id', v_event_id,
    'components', coalesce(v_source_materials, '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.create_biological_material_mixture(uuid, uuid[], text, text, timestamptz, text, jsonb) from public;
revoke all on function public.create_biological_material_mixture(uuid, uuid[], text, text, timestamptz, text, jsonb) from anon;
grant execute on function public.create_biological_material_mixture(uuid, uuid[], text, text, timestamptz, text, jsonb) to authenticated;
