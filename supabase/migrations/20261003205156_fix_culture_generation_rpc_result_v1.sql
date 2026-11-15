drop function if exists public.create_culture_with_generation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,jsonb);

create or replace function public.create_culture_with_generation(
  p_organization_id uuid,
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
set search_path = public, private
as $function$
declare
  parent_material public.materials%rowtype;
  parent_culture public.cultures%rowtype;
  new_material public.materials%rowtype;
  new_culture public.cultures%rowtype;
  next_generation integer;
  v_material_code text;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied';
  end if;

  if p_code is null or btrim(p_code) = '' then
    raise exception 'culture_code_required';
  end if;

  select * into parent_material
  from public.materials
  where organization_id = p_organization_id and id = p_parent_material_id
  for update;

  if not found then
    raise exception 'parent_material_not_found';
  end if;

  if parent_material.state <> 'active' then
    raise exception 'parent_material_not_active';
  end if;

  if p_parent_culture_id is not null then
    select * into parent_culture
    from public.cultures
    where organization_id = p_organization_id and id = p_parent_culture_id
    for update;

    if not found then
      raise exception 'parent_culture_not_found';
    end if;

    if parent_culture.material_id <> p_parent_material_id then
      raise exception 'parent_culture_material_mismatch';
    end if;
  end if;

  next_generation := coalesce(parent_material.generation, 0) + 1;

  v_material_code :=
    'MAT-' || regexp_replace(upper(p_code), '[^A-Z0-9_-]+', '-', 'g');

  if exists (
    select 1
    from public.materials m
    where m.organization_id = p_organization_id
      and m.material_code = v_material_code
  ) then
    v_material_code := v_material_code || '-G' || next_generation;
  end if;

  insert into public.materials(
    organization_id, material_code, material_type, strain_id,
    parent_material_id, state, generation, metadata
  )
  values (
    p_organization_id, v_material_code, 'culture_derived',
    parent_material.strain_id, p_parent_material_id, 'active',
    next_generation,
    jsonb_build_object(
      'derived_from_generation', parent_material.generation,
      'generation_method', 'culture_propagation'
    ) || coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into new_material;

  insert into public.cultures(
    organization_id, code, culture_type, material_id,
    parent_culture_id, experiment_id, experimental_unit_id,
    protocol_version_id, environment_id, started_at, metadata
  )
  values (
    p_organization_id, p_code, p_culture_type, new_material.id,
    p_parent_culture_id, p_experiment_id, p_experimental_unit_id,
    p_protocol_version_id, p_environment_id, p_started_at,
    coalesce(p_metadata, '{}'::jsonb) ||
    jsonb_build_object('generation', next_generation)
  )
  returning * into new_culture;

  insert into public.events(
    organization_id, event_type, occurred_at,
    culture_id, payload
  )
  values (
    p_organization_id,
    'culture_created',
    coalesce(p_started_at, now()),
    new_culture.id,
    jsonb_build_object(
      'parent_material_id', p_parent_material_id,
      'parent_culture_id', p_parent_culture_id,
      'derived_material_id', new_material.id,
      'generation', next_generation
    )
  );

  return jsonb_build_object(
    'culture_id', new_culture.id,
    'culture_code', new_culture.code,
    'material_id', new_material.id,
    'material_code', new_material.material_code,
    'generation', next_generation
  );
end;
$function$;

grant execute on function public.create_culture_with_generation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,jsonb) to authenticated;
revoke execute on function public.create_culture_with_generation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,jsonb) from anon;
