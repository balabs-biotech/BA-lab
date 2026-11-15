
insert into public.variables(code,label,dimension,canonical_unit_code,description)
values ('myc_colony_diameter_rate','Mycelial colony diameter growth rate','speed','mm/day',
'Mean change in measured colony diameter per day; distinct from radial extension rate.')
on conflict(code) do update set label=excluded.label,dimension=excluded.dimension,
canonical_unit_code=excluded.canonical_unit_code,description=excluded.description;

insert into public.domain_variable_catalog(domain,variable_code,category,context_requirements,comparison_policy,status,metadata)
values ('mycology','myc_colony_diameter_rate','kinetics',
 array['same_culture','same_measurement_axis','same_measurement_method','elapsed_time'],
 'derived_only','active',
 '{"derived":true,"formula_code":"mycology.colony_diameter_rate","formula_version":"1.0.0","not_radial_extension":true}'::jsonb)
on conflict(domain,variable_code) do update set category=excluded.category,
 context_requirements=excluded.context_requirements,comparison_policy=excluded.comparison_policy,
 status=excluded.status,metadata=excluded.metadata;

update public.derived_formula_registry
set output_metric_code='myc_colony_diameter_rate',updated_at=now()
where organization_id is null and domain='mycology' and formula_code='mycology.colony_diameter_rate' and formula_version='1.0.0';
;
