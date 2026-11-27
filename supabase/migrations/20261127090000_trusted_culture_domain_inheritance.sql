-- Trusted biological domain inheritance for new culture generations.
-- A culture inherits the domain of its persisted parent material; client metadata is never authoritative.

create or replace function private.get_biological_domain(
  p_organization_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_metadata_domain text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with recursive material_lineage(id, parent_material_id, metadata_domain, path) as (
    select m.id, m.parent_material_id, m.metadata ->> 'domain', array[m.id]
      from public.materials m
     where p_target_type = 'material'
       and m.organization_id = p_organization_id
       and m.id = p_target_id
    union all
    select parent.id, parent.parent_material_id, parent.metadata ->> 'domain',
           lineage.path || parent.id
      from material_lineage lineage
      join public.materials parent
        on parent.organization_id = p_organization_id
       and parent.id = lineage.parent_material_id
     where not parent.id = any(lineage.path)
  ),
  signals(domain) as (
    select c.domain
      from private.biological_domain_classifications c
     where c.organization_id = p_organization_id
       and c.target_type = p_target_type
       and c.target_id = p_target_id
    union all
    select p_metadata_domain
     where p_target_type = 'culture'
       and p_metadata_domain in ('mycology','laboratory')
    union all
    select lineage.metadata_domain
      from material_lineage lineage
     where lineage.metadata_domain in ('mycology','laboratory')
    union all
    select c.domain
      from private.biological_domain_classifications c
      join material_lineage lineage on lineage.id = c.target_id
     where c.organization_id = p_organization_id
       and c.target_type = 'material'
  )
  select case when count(distinct domain) = 1 then min(domain) else null end
    from signals
$$;

revoke all on function private.get_biological_domain(uuid,text,uuid,text) from public, anon, authenticated;

create or replace function private.prevent_biological_domain_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_domain text;
  v_parent_id uuid;
begin
  v_domain := new.metadata ->> 'domain';

  if new.metadata ? 'domain' and (
       (tg_table_name = 'plant_cultures' and v_domain is distinct from 'agronomy')
       or
       (tg_table_name <> 'plant_cultures' and (v_domain is null or v_domain not in ('mycology', 'laboratory')))
     ) then
    raise exception 'invalid_biological_domain';
  end if;

  if tg_op = 'INSERT' and tg_table_name = 'materials' and new.parent_material_id is not null then
    v_parent_id := new.parent_material_id;
    select private.get_biological_domain(
             new.organization_id, 'material', parent.id, parent.metadata ->> 'domain'
           )
      into v_domain
      from public.materials parent
     where parent.organization_id = new.organization_id and parent.id = v_parent_id;
    if v_domain is null then
      if new.metadata ? 'domain' then
        raise exception 'parent_material_domain_unclassified';
      end if;
    else
      if new.metadata ? 'domain' and new.metadata ->> 'domain' is distinct from v_domain then
        raise exception 'derived_material_domain_mismatch';
      end if;
      new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('domain', v_domain);
    end if;
  elsif tg_op = 'INSERT' and tg_table_name = 'cultures' and new.material_id is not null then
    select private.get_biological_domain(
             new.organization_id, 'material', parent.id, parent.metadata ->> 'domain'
           )
      into v_domain
      from public.materials parent
     where parent.organization_id = new.organization_id and parent.id = new.material_id;
    if v_domain is null then
      if new.metadata ? 'domain' then
        raise exception 'parent_material_domain_unclassified';
      end if;
    else
      if new.metadata ? 'domain' and new.metadata ->> 'domain' is distinct from v_domain then
        raise exception 'culture_domain_mismatch_with_parent_material';
      end if;
      new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('domain', v_domain);
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.metadata ->> 'domain' is distinct from old.metadata ->> 'domain' then
      raise exception 'biological_domain_is_immutable';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.create_culture_with_generation(
  p_organization_id uuid,
  p_code text,
  p_culture_type text,
  p_parent_material_id uuid,
  p_parent_culture_id uuid default null::uuid,
  p_protocol_version_id uuid default null::uuid,
  p_environment_id uuid default null::uuid,
  p_experiment_id uuid default null::uuid,
  p_experimental_unit_id uuid default null::uuid,
  p_started_at timestamptz default null::timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path to 'public', 'private'
as $function$
declare
  parent_material public.materials%rowtype;
  parent_culture public.cultures%rowtype;
  new_material public.materials%rowtype;
  new_culture public.cultures%rowtype;
  next_generation integer;
  v_material_code text;
  v_domain text;
  v_metadata jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied';
  end if;

  if not exists (
    select 1 from public.culture_data_consents c
     where c.organization_id = p_organization_id
       and c.user_id = auth.uid()
       and c.terms_version = '2026-10-09-v1'
       and c.terms_accepted_at is not null
  ) then
    raise exception 'batchtracker_terms_acceptance_required';
  end if;

  if p_code is null or btrim(p_code) = '' then
    raise exception 'culture_code_required';
  end if;

  select * into parent_material
    from public.materials
   where organization_id = p_organization_id and id = p_parent_material_id
   for update;
  if not found then raise exception 'parent_material_not_found'; end if;
  if parent_material.state <> 'active' then raise exception 'parent_material_not_active'; end if;

  v_domain := private.get_biological_domain(
    p_organization_id, 'material', parent_material.id, parent_material.metadata ->> 'domain'
  );
  if v_domain not in ('mycology','laboratory') then
    raise exception 'parent_material_domain_unclassified';
  end if;

  if p_parent_culture_id is not null then
    select * into parent_culture
      from public.cultures
     where organization_id = p_organization_id and id = p_parent_culture_id
     for update;
    if not found then raise exception 'parent_culture_not_found'; end if;
    if parent_culture.material_id <> p_parent_material_id then
      raise exception 'parent_culture_material_mismatch';
    end if;
    if private.get_biological_domain(
         p_organization_id, 'culture', parent_culture.id, parent_culture.metadata ->> 'domain'
       ) is distinct from v_domain then
      raise exception 'parent_culture_domain_mismatch';
    end if;
  end if;

  next_generation := coalesce(parent_material.generation, 0) + 1;
  v_material_code := 'MAT-' || regexp_replace(upper(p_code), '[^A-Z0-9_-]+', '-', 'g');
  if exists (
    select 1 from public.materials m
     where m.organization_id = p_organization_id and m.material_code = v_material_code
  ) then
    v_material_code := v_material_code || '-G' || next_generation;
  end if;

  v_metadata := (coalesce(p_metadata, '{}'::jsonb) - 'domain')
                || jsonb_build_object('domain', v_domain);

  insert into public.materials(
    organization_id, material_code, material_type, strain_id,
    parent_material_id, state, generation, metadata
  ) values (
    p_organization_id, v_material_code, 'culture_derived',
    parent_material.strain_id, p_parent_material_id, 'active',
    next_generation,
    jsonb_build_object(
      'derived_from_generation', parent_material.generation,
      'generation_method', 'culture_propagation'
    ) || v_metadata
  ) returning * into new_material;

  insert into public.cultures(
    organization_id, code, culture_type, material_id,
    parent_culture_id, experiment_id, experimental_unit_id,
    protocol_version_id, environment_id, started_at, metadata
  ) values (
    p_organization_id, p_code, p_culture_type, new_material.id,
    p_parent_culture_id, p_experiment_id, p_experimental_unit_id,
    p_protocol_version_id, p_environment_id, p_started_at,
    v_metadata || jsonb_build_object('generation', next_generation)
  ) returning * into new_culture;

  insert into public.events(organization_id, event_type, occurred_at, culture_id, payload)
  values (
    p_organization_id, 'culture_created', coalesce(p_started_at, now()),
    new_culture.id,
    jsonb_build_object(
      'parent_material_id', p_parent_material_id,
      'parent_culture_id', p_parent_culture_id,
      'derived_material_id', new_material.id,
      'generation', next_generation,
      'domain', v_domain
    )
  );

  return jsonb_build_object(
    'culture_id', new_culture.id,
    'culture_code', new_culture.code,
    'material_id', new_material.id,
    'material_code', new_material.material_code,
    'generation', next_generation,
    'domain', v_domain
  );
end;
$function$;

revoke all on function public.create_culture_with_generation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,jsonb) from public, anon;
grant execute on function public.create_culture_with_generation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,jsonb) to authenticated;
