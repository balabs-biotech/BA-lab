
create table if not exists public.domain_variable_catalog (
  domain text not null check (domain in ('greentech','lab','mycology')),
  variable_code text not null references public.variables(code) on update cascade on delete restrict,
  category text not null,
  context_requirements text[] not null default '{}',
  comparison_policy text not null default 'descriptive_only'
    check (comparison_policy in ('descriptive_only','canonical_unit_only','validated_reference_only','derived_only')),
  status text not null default 'active' check (status in ('active','deprecated')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (domain, variable_code)
);
alter table public.domain_variable_catalog enable row level security;
drop policy if exists domain_variable_catalog_select on public.domain_variable_catalog;
create policy domain_variable_catalog_select on public.domain_variable_catalog
  for select to authenticated using (true);

insert into public.variables(code,label,dimension,canonical_unit_code,description) values
('soil_organic_matter','Soil organic matter','fraction','%','Soil organic matter content; record analytical method and dry-mass basis.'),
('soil_moisture','Soil moisture','fraction','%','Soil water content; record gravimetric or volumetric method and sampling depth.'),
('ndvi','Normalized Difference Vegetation Index','dimensionless','dimensionless','Remote-sensing vegetation index; retain sensor, processing level, cloud mask and spatial resolution.'),
('leaf_area_index','Leaf Area Index','dimensionless','dimensionless','One-sided leaf area per unit ground area; record measurement method and crop stage.'),
('plant_height','Plant height','length','mm','Plant height; record measurement protocol and sampled plant count.'),
('colony_diameter','Colony diameter','length','mm','Microbial or fungal colony diameter; record medium, incubation conditions and measurement axis.'),
('inoculum_volume','Inoculum volume','volume','mL','Volume of inoculum applied; record concentration and inoculation method where available.')
on conflict (code) do nothing;

insert into public.domain_variable_catalog(domain,variable_code,category,context_requirements,comparison_policy,metadata) values
('greentech','ph','soil_chemistry',array['sampling_depth','analytical_method','sample_matrix'],'descriptive_only','{"method_sensitive":true,"thresholds_enabled":false}'::jsonb),
('greentech','electrical_conductivity','soil_water_chemistry',array['sample_matrix','analytical_method','dilution_or_extraction_ratio'],'descriptive_only','{"method_sensitive":true,"thresholds_enabled":false}'::jsonb),
('greentech','soil_organic_matter','soil_chemistry',array['sampling_depth','analytical_method','dry_mass_basis'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('greentech','soil_moisture','soil_physics',array['sampling_depth','measurement_method'],'descriptive_only','{"volumetric_and_gravimetric_not_interchangeable":true}'::jsonb),
('greentech','ndvi','remote_sensing',array['sensor','acquisition_time','spatial_resolution','cloud_mask'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('greentech','leaf_area_index','plant_structure',array['crop','cultivar','phenological_stage','measurement_method'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('greentech','plant_height','plant_growth',array['crop','cultivar','phenological_stage','sample_count'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('greentech','temperature','climate',array['sensor_or_provider','location','observed_at'],'canonical_unit_only','{"thresholds_enabled":false}'::jsonb),
('greentech','relative_humidity','climate',array['sensor_or_provider','location','observed_at'],'canonical_unit_only','{"thresholds_enabled":false}'::jsonb),
('greentech','root_length','plant_growth',array['crop','cultivar','phenological_stage','measurement_method'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('greentech','shoot_length','plant_growth',array['crop','cultivar','phenological_stage','measurement_method'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('lab','ph','medium_chemistry',array['medium_code','measurement_method','measurement_time'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('lab','electrical_conductivity','medium_chemistry',array['medium_code','measurement_method','dilution_or_extraction_ratio'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('lab','temperature','incubation',array['organism_or_strain','medium_code','incubator_or_location','observed_at'],'canonical_unit_only','{"thresholds_enabled":false}'::jsonb),
('lab','od600','growth_kinetics',array['organism_or_strain','medium_code','blank','dilution_factor','instrument'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('lab','colony_count','growth_kinetics',array['organism_or_strain','medium_code','dilution_factor','plating_volume','replicate_id'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('lab','cfu_per_ml','growth_kinetics',array['organism_or_strain','medium_code','dilution_factor','plating_volume','replicate_id'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('lab','cell_count_per_ml','growth_kinetics',array['organism_or_strain','medium_code','counting_method','instrument'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('lab','colony_diameter','morphology_growth',array['organism_or_strain','medium_code','incubation_temperature','incubation_time','measurement_axis'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('lab','viability','preservation',array['organism_or_strain','preservation_method','recovery_protocol','assay_method'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('lab','growth_rate','growth_kinetics',array['organism_or_strain','medium_code','calculation_model','time_unit','replicate_id'],'descriptive_only','{"thresholds_enabled":false}'::jsonb),
('lab','incubation_time','incubation',array['organism_or_strain','medium_code','incubation_temperature','time_origin'],'canonical_unit_only','{"thresholds_enabled":false}'::jsonb),
('lab','inoculum_volume','inoculation',array['organism_or_strain','inoculum_concentration','medium_code','inoculation_method'],'descriptive_only','{"thresholds_enabled":false}'::jsonb)
on conflict (domain,variable_code) do update set
 category=excluded.category,
 context_requirements=excluded.context_requirements,
 comparison_policy=excluded.comparison_policy,
 metadata=excluded.metadata,
 status='active';
;
