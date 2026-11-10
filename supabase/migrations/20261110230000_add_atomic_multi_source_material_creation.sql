-- Atomic creation of a biological material from multiple source materials.
begin;

create or replace function public.create_biological_material_mixture(
  p_organization_id uuid,
  p_source_material_ids uuid[],
  p_event_type text,
  p_result_code text,
  p_occurred_at timestamptz default now(),
  p_note text default null,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_source_count integer;
  v_active_count integer;
  v_generation integer;
  v_common_strain_id uuid;
  v_material_code text;
  v_material_id uuid;
  v_event_id uuid;
  v_source record;
  v_components jsonb := '[]'::jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  if p_event_type is null or p_event_type not in ('mixing','consortium_assembly','blending') then
    raise exception 'unsupported_material_mixture_operation';
  end if;

  if p_source_material_ids is null
     or cardinality(p_source_material_ids) < 2
     or cardinality(p_source_material_ids) > 12
     or array_position(p_source_material_ids, null) is not null then
    raise exception 'material_mixture_requires_two_to_twelve_sources';
  end if;

  if (select count(distinct source_id) from unnest(p_source_material_ids) as ids(source_id))
     <> cardinality(p_source_material_ids) then
    raise exception 'material_mixture_sources_must_be_unique';
  end if;

  if nullif(btrim(coalesce(p_result_code, '')), '') is null then
    raise exception 'material_mixture_result_code_required';
  end if;

  select count(*), count(*) filter (where m.state = 'active'),
         coalesce(max(m.generation), 0),
         case
           when count(*) = cardinality(p_source_material_ids)
             and count(m.strain_id) = count(*)
             and count(distinct m.strain_id) = 1
           then (array_agg(m.strain_id))[1]
           else null
         end
    into v_source_count, v_active_count, v_generation, v_common_strain_id
    from public.materials m
   where m.organization_id = p_organization_id
     and m.id = any(p_source_material_ids);

  if v_source_count <> cardinality(p_source_material_ids) then
    raise exception 'material_mixture_source_not_found';
  end if;
  if v_active_count <> v_source_count then
    raise exception 'material_mixture_sources_must_be_active';
  end if;

  -- Lock source rows in a stable order to avoid deadlocks between concurrent mixtures.
  perform m.id
    from public.materials m
   where m.organization_id = p_organization_id
     and m.id = any(p_source_material_ids)
   order by m.id
   for update;

  v_material_code := 'MAT-' || regexp_replace(upper(btrim(p_result_code)), '[^A-Z0-9_-]+', '-', 'g');
  while exists (
    select 1 from public.materials m
     where m.organization_id = p_organization_id and m.material_code = v_material_code
  ) loop
    v_material_code := v_material_code || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end loop;

  insert into public.materials(
    organization_id, material_code, material_type, strain_id,
    parent_material_id, state, generation, metadata
  ) values (
    p_organization_id, v_material_code, 'culture_derived', v_common_strain_id,
    null, 'active', v_generation + 1,
    jsonb_build_object(
      'generation_method', p_event_type,
      'source_material_ids', to_jsonb(p_source_material_ids),
      'source_count', v_source_count,
      'strain_inheritance', case when v_common_strain_id is null then 'multiple_or_unspecified' else 'single_common_strain' end
    )
  ) returning id into v_material_id;

  insert into public.events(
    organization_id, event_type, occurred_at, actor_user_id, material_id, payload
  ) values (
    p_organization_id, p_event_type, coalesce(p_occurred_at, now()), auth.uid(), v_material_id,
    jsonb_build_object(
      'operation', 'multi_source_material_creation',
      'material_id', v_material_id,
      'material_code', v_material_code,
      'source_material_ids', to_jsonb(p_source_material_ids),
      'note', nullif(btrim(coalesce(p_note, '')), ''),
      'details', coalesce(p_details, '{}'::jsonb)
    )
  ) returning id into v_event_id;

  update public.materials
     set metadata = metadata || jsonb_build_object('source_event_id', v_event_id)
   where organization_id = p_organization_id and id = v_material_id;

  for v_source in
    select m.id, m.material_code, m.strain_id, m.generation
      from public.materials m
     where m.organization_id = p_organization_id
       and m.id = any(p_source_material_ids)
     order by m.material_code, m.id
  loop
    insert into public.material_relationships(
      organization_id, parent_material_id, child_material_id, relationship_type
    ) values (
      p_organization_id, v_source.id, v_material_id, p_event_type
    );

    v_components := v_components || jsonb_build_array(jsonb_build_object(
      'material_id', v_source.id,
      'material_code', v_source.material_code,
      'strain_id', v_source.strain_id,
      'generation', v_source.generation,
      'relationship_type', p_event_type
    ));
  end loop;

  return jsonb_build_object(
    'event_id', v_event_id,
    'material_id', v_material_id,
    'material_code', v_material_code,
    'event_type', p_event_type,
    'generation', v_generation + 1,
    'components', v_components
  );
end;
$function$;

revoke all on function public.create_biological_material_mixture(uuid,uuid[],text,text,timestamptz,text,jsonb) from public, anon;
grant execute on function public.create_biological_material_mixture(uuid,uuid[],text,text,timestamptz,text,jsonb) to authenticated;

commit;
