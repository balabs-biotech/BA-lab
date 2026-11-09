-- Read-only, bounded evidence bundle for comparing selected biological culture generations.
-- The response preserves source types and quality metadata; it does not infer causality.
create function public.compare_culture_generations(
  p_organization_id uuid,
  p_culture_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_ids uuid[];
  v_requested_count integer;
  v_found_count integer;
  v_result jsonb;
begin
  if auth.uid() is null or not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  if p_culture_ids is null then
    raise exception 'culture_ids_required' using errcode = '22023';
  end if;

  select array_agg(distinct id order by id)
    into v_ids
    from unnest(p_culture_ids) as requested(id)
   where id is not null;

  v_requested_count := coalesce(cardinality(v_ids), 0);
  if v_requested_count < 2 or v_requested_count > 4 then
    raise exception 'comparison_requires_two_to_four_cultures' using errcode = '22023';
  end if;

  select count(*)::integer
    into v_found_count
    from public.cultures c
   where c.organization_id = p_organization_id
     and c.id = any(v_ids);

  if v_found_count <> v_requested_count then
    raise exception 'culture_not_found_or_not_in_organization' using errcode = 'P0002';
  end if;

  with recursive selected as (
    select c.organization_id, c.id, c.code, c.culture_type, c.material_id,
           c.parent_culture_id, c.experiment_id, c.experimental_unit_id,
           c.protocol_version_id, c.environment_id, c.started_at, c.created_at,
           m.material_code, m.material_type, m.strain_id, m.parent_material_id,
           m.generation as material_generation, m.state as material_state,
           m.metadata as material_metadata
      from public.cultures c
      join public.materials m
        on m.organization_id = c.organization_id
       and m.id = c.material_id
     where c.organization_id = p_organization_id
       and c.id = any(v_ids)
  ),
  selected_units as (
    select distinct experimental_unit_id as id
      from selected
     where experimental_unit_id is not null
  ),
  selected_envs as (
    select distinct environment_id as id
      from selected
     where environment_id is not null
    union
    select distinct b.environment_id
      from public.batches b
      join selected s on s.organization_id = b.organization_id
     where b.organization_id = p_organization_id
       and b.environment_id is not null
       and (b.culture_id = any(v_ids) or b.material_id in (select material_id from selected))
  ),
  selected_locations as (
    select distinct e.location_id as id
      from public.environments e
      join selected_envs se on se.id = e.id
     where e.organization_id = p_organization_id
       and e.location_id is not null
  ),
  selected_experiments as (
    select distinct experiment_id as id
      from selected
     where experiment_id is not null
    union
    select distinct eu.experiment_id
      from public.experimental_units eu
      join selected s on s.organization_id = eu.organization_id
                     and s.experimental_unit_id = eu.id
     where eu.organization_id = p_organization_id
  ),
  selected_materials as (
    select distinct material_id as id
      from selected
  ),
  selected_batches as (
    select b.id
      from public.batches b
     where b.organization_id = p_organization_id
       and b.culture_id = any(v_ids)
  ),
  culture_rows as (
    select s.*,
           e.code as experiment_code, e.name as experiment_name,
           eu.unit_code, eu.replicate_no, eu.treatment_code,
           pv.version as protocol_version
      from selected s
      left join public.experiments e
        on e.organization_id = s.organization_id and e.id = s.experiment_id
      left join public.experimental_units eu
        on eu.organization_id = s.organization_id and eu.id = s.experimental_unit_id
      left join public.protocol_versions pv
        on pv.organization_id = s.organization_id and pv.id = s.protocol_version_id
  ),
  lineage_walk as (
    select s.id as selected_culture_id, p.id as ancestor_culture_id,
           p.parent_culture_id, 1 as depth,
           array[s.id, p.id]::uuid[] as path
      from selected s
      join public.cultures p
        on p.organization_id = s.organization_id
       and p.id = s.parent_culture_id
    union all
    select w.selected_culture_id, p.id, p.parent_culture_id,
           w.depth + 1, w.path || p.id
      from lineage_walk w
      join public.cultures p
        on p.organization_id = p_organization_id
       and p.id = w.parent_culture_id
     where w.depth < 250
       and not p.id = any(w.path)
  ),
  measurement_rows as (
    select m.id, m.culture_id, m.environment_id, m.variable_code,
           m.raw_value, m.raw_unit_code, m.normalized_value,
           m.normalized_unit_code, m.measured_at, m.method, m.instrument,
           m.quality_state, m.exclusion_reason, m.metadata,
           case when m.culture_id is not null then 'culture' else 'environment' end as source_relation
      from public.measurements m
     where m.organization_id = p_organization_id
       and (
         m.culture_id = any(v_ids)
         or (m.culture_id is null and m.environment_id in (select id from selected_envs))
       )
     order by m.measured_at desc, m.id
     limit 500
  ),
  observation_rows as (
    select o.id, o.culture_id, o.experimental_unit_id, o.variable_code,
           o.value_text, o.observed_at, o.quality_state, o.metadata,
           case when o.culture_id is not null then 'culture' else 'experimental_unit' end as source_relation
      from public.observations o
     where o.organization_id = p_organization_id
       and (
         o.culture_id = any(v_ids)
         or (o.culture_id is null and o.experimental_unit_id in (select id from selected_units))
       )
     order by o.observed_at desc, o.id
     limit 500
  ),
  event_rows as (
    select e.id, e.event_type, e.occurred_at, e.culture_id, e.material_id,
           e.batch_id, e.environment_id, e.payload,
           case
             when e.culture_id = any(v_ids) then 'culture'
             when e.material_id in (select id from selected_materials) then 'material'
             when e.batch_id in (select id from selected_batches) then 'batch'
             else 'environment'
           end as source_relation
      from public.events e
     where e.organization_id = p_organization_id
       and (
         e.culture_id = any(v_ids)
         or e.material_id in (select id from selected_materials)
         or e.batch_id in (select id from selected_batches)
         or e.experimental_unit_id in (select id from selected_units)
         or (e.culture_id is null and e.material_id is null and e.experimental_unit_id is null
             and e.environment_id in (select id from selected_envs))
       )
     order by e.occurred_at desc, e.id
     limit 500
  ),
  result_rows as (
    select r.id, r.experiment_id, r.experimental_unit_id, r.code,
           r.result_type, r.value, r.quality_state, r.created_at,
           case when r.experimental_unit_id is not null then 'experimental_unit' else 'experiment' end as source_relation
      from public.results r
     where r.organization_id = p_organization_id
       and (r.experimental_unit_id in (select id from selected_units)
         or (r.experimental_unit_id is null and r.experiment_id in (select id from selected_experiments)))
     order by r.created_at desc, r.id
     limit 500
  ),
  environmental_rows as (
    select eo.id, eo.location_id, eo.data_family, eo.provider_code,
           eo.dataset_code, eo.variable_code, eo.value, eo.unit_code,
           eo.observed_at, eo.retrieved_at, eo.spatial_resolution_m,
           eo.quality_flag, eo.source_url, eo.metadata
      from public.environmental_observations eo
     where eo.organization_id = p_organization_id
       and eo.location_id in (select id from selected_locations)
     order by eo.observed_at desc, eo.id
     limit 500
  ),
  batch_rows as (
    select b.id, b.batch_code, b.name, b.batch_type, b.status,
           b.current_stage, b.culture_id, b.material_id, b.environment_id,
           b.planned_at, b.started_at, b.completed_at,
           b.quantity_planned, b.quantity_actual, b.quantity_unit_code,
           b.metadata
      from public.batches b
     where b.organization_id = p_organization_id
       and (b.culture_id = any(v_ids) or b.material_id in (select id from selected_materials))
     order by b.created_at desc, b.id
     limit 200
  ),
  counts as (
    select
      (select count(*) from public.measurements m
        where m.organization_id = p_organization_id
          and (m.culture_id = any(v_ids)
            or (m.culture_id is null and m.environment_id in (select id from selected_envs)))) as measurement_count,
      (select count(*) from public.observations o
        where o.organization_id = p_organization_id
          and (o.culture_id = any(v_ids)
            or (o.culture_id is null and o.experimental_unit_id in (select id from selected_units)))) as observation_count,
      (select count(*) from public.events e
        where e.organization_id = p_organization_id
          and (e.culture_id = any(v_ids)
            or e.material_id in (select id from selected_materials)
            or e.batch_id in (select id from selected_batches)
            or (e.culture_id is null and e.material_id is null
                and e.environment_id in (select id from selected_envs)))) as event_count,
      (select count(*) from public.batches b
        where b.organization_id = p_organization_id
          and (b.culture_id = any(v_ids) or b.material_id in (select id from selected_materials))) as batch_count,
      (select count(*) from public.environmental_observations eo
        where eo.organization_id = p_organization_id
          and eo.location_id in (select id from selected_locations)) as environmental_count,
      (select count(*) from public.results r
        where r.organization_id = p_organization_id
          and (r.experimental_unit_id in (select id from selected_units)
            or (r.experimental_unit_id is null and r.experiment_id in (select id from selected_experiments)))) as result_count
  )
  select jsonb_build_object(
    'schema_version', 1,
    'generated_at', now(),
    'organization_id', p_organization_id,
    'culture_ids', to_jsonb(v_ids),
    'cultures', coalesce((select jsonb_agg(to_jsonb(c) order by c.code) from culture_rows c), '[]'::jsonb),
    'lineage', coalesce((
      select jsonb_agg(jsonb_build_object(
        'selected_culture_id', w.selected_culture_id,
        'ancestor_culture_id', w.ancestor_culture_id,
        'depth', w.depth
      ) order by w.selected_culture_id, w.depth)
      from lineage_walk w
    ), '[]'::jsonb),
    'measurements', coalesce((select jsonb_agg(to_jsonb(m) order by m.measured_at desc, m.id) from measurement_rows m), '[]'::jsonb),
    'observations', coalesce((select jsonb_agg(to_jsonb(o) order by o.observed_at desc, o.id) from observation_rows o), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at desc, e.id) from event_rows e), '[]'::jsonb),
    'batches', coalesce((select jsonb_agg(to_jsonb(b) order by b.started_at nulls last, b.id) from batch_rows b), '[]'::jsonb),
    'results', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id) from result_rows r), '[]'::jsonb),
    'environmental_observations', coalesce((select jsonb_agg(to_jsonb(eo) order by eo.observed_at desc, eo.id) from environmental_rows eo), '[]'::jsonb),
    'data_quality', jsonb_build_object(
      'measurement_total', counts.measurement_count,
      'measurement_returned', (select count(*) from measurement_rows),
      'measurement_truncated', counts.measurement_count > 500,
      'observation_total', counts.observation_count,
      'observation_returned', (select count(*) from observation_rows),
      'observation_truncated', counts.observation_count > 500,
      'event_total', counts.event_count,
      'event_returned', (select count(*) from event_rows),
      'event_truncated', counts.event_count > 500,
      'batch_total', counts.batch_count,
      'batch_returned', (select count(*) from batch_rows),
      'batch_truncated', counts.batch_count > 200,
      'result_total', counts.result_count,
      'result_returned', (select count(*) from result_rows),
      'result_truncated', counts.result_count > 500,
      'environmental_total', counts.environmental_count,
      'environmental_returned', (select count(*) from environmental_rows),
      'environmental_truncated', counts.environmental_count > 500,
      'excluded_measurements', (
        select count(*) from public.measurements m
         where m.organization_id = p_organization_id
           and m.quality_state = 'excluded'
           and (m.culture_id = any(v_ids)
             or (m.culture_id is null and m.environment_id in (select id from selected_envs)))
      ),
      'measurements_without_normalized_value', (
        select count(*) from public.measurements m
         where m.organization_id = p_organization_id
           and m.quality_state <> 'excluded'
           and m.normalized_value is null
           and (m.culture_id = any(v_ids)
             or (m.culture_id is null and m.environment_id in (select id from selected_envs)))
      ),
      'interpretation', 'Descriptive evidence only. Missing values are not zero; shared environments are contextual evidence, not independent culture measurements.'
    )
  )
  into v_result
  from counts;

  return v_result;
end;
$function$;

revoke all on function public.compare_culture_generations(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.compare_culture_generations(uuid, uuid[])
  to authenticated;
