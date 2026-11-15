
alter table public.derived_formula_registry
 drop constraint derived_formula_registry_implementation_key_check;
alter table public.derived_formula_registry
 add constraint derived_formula_registry_implementation_key_check
 check (implementation_key = any (array[
 'difference_over_elapsed_time_v1','percent_of_reference_v1','cfu_per_ml_v1',
 'biological_efficiency_v1','log_growth_rate_v1','replicate_summary_v1',
 'generation_time_v1','colony_diameter_rate_v1'
 ]));

insert into public.derived_formula_registry
(organization_id,domain,formula_code,formula_version,implementation_key,output_metric_code,output_unit_code,input_contract,formula_definition,assumptions,limitations,evidence_refs,status)
values
(null,'lab','lab.generation_time_from_specific_growth_rate','1.0.0','generation_time_v1','generation_time','h',
 '{"inputs":[{"name":"specific_growth_rate_1_per_h","type":"number","min_exclusive":0}],"source_formula":"series.log_growth_rate@1.0.0"}'::jsonb,
 '{"expression":"ln(2) / specific_growth_rate_1_per_h","result_unit":"h"}'::jsonb,
 array['The specific growth rate is positive and expressed in h^-1'],
 array['Valid only for exponential-growth intervals where the specific growth rate is representative','OD-derived growth rate is not equivalent to viable-cell growth without independent validation'],
 '[]'::jsonb,'active'),
(null,'mycology','mycology.colony_diameter_rate','1.0.0','colony_diameter_rate_v1','growth_rate','mm/day',
 '{"inputs":[{"name":"initial_diameter_mm","type":"number","min":0},{"name":"final_diameter_mm","type":"number","min":0},{"name":"elapsed_days","type":"number","min_exclusive":0}],"subject_consistency":"same_culture_same_axis_same_method","minimum_timepoints":2}'::jsonb,
 '{"expression":"(final_diameter_mm - initial_diameter_mm) / elapsed_days","result_unit":"mm/day","interpretation":"mean linear diameter change per day; not radial extension rate"}'::jsonb,
 array['Both diameter values refer to the same culture and measurement axis','Elapsed time is derived from actual timestamps'],
 array['Two-point mean rate does not represent the full growth curve','Do not divide by two unless explicitly calculating radial extension','Replicates and axes must remain separately identifiable'],
 '[]'::jsonb,'active')
on conflict (organization_id,domain,formula_code,formula_version) do update set
 implementation_key=excluded.implementation_key,output_metric_code=excluded.output_metric_code,
 output_unit_code=excluded.output_unit_code,input_contract=excluded.input_contract,
 formula_definition=excluded.formula_definition,assumptions=excluded.assumptions,
 limitations=excluded.limitations,status=excluded.status,updated_at=now();
;
