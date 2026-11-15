
alter table public.derived_formula_registry drop constraint if exists derived_formula_registry_implementation_key_check;
alter table public.derived_formula_registry add constraint derived_formula_registry_implementation_key_check
check (implementation_key = any (array[
'difference_over_elapsed_time_v1','percent_of_reference_v1','cfu_per_ml_v1','biological_efficiency_v1',
'log_growth_rate_v1','replicate_summary_v1','generation_time_v1','colony_diameter_rate_v1',
'log_linear_regression_growth_rate_v1']));
insert into public.derived_formula_registry
(domain,formula_code,formula_version,implementation_key,output_metric_code,output_unit_code,input_contract,formula_definition,assumptions,limitations,evidence_refs,status)
values
('lab','lab.od600_log_linear_regression','1.0.0','log_linear_regression_growth_rate_v1','growth_rate','1/h',
'{"inputs":[{"name":"series_points","type":"array","min_items":3,"items":{"x":"elapsed_hours","y":"blank_corrected_od600"}}],"series_requirements":{"same_sample":true,"same_experimental_unit":true,"same_method":true,"same_instrument":true,"strictly_increasing_timestamps":true,"blank_correction_required":true,"positive_od600_required":true},"minimum_points":3}',
'{"expression":"ordinary_least_squares_slope(ln(blank_corrected_OD600), elapsed_hours)","result_unit":"1/h","estimator":"OLS slope of ln(OD600) against elapsed hours","minimum_points":3}',
array['OD600 values are explicitly blank-corrected before analysis','All points belong to one sample and one experimental unit, measured with a consistent method and instrument','Elapsed time is calculated from recorded timestamps; the first point defines t=0'],
array['The slope is a descriptive estimate for the selected interval and does not prove exponential growth','OD600 is an indirect turbidity proxy, not a viable-cell count','The model does not automatically detect or remove lag phase, stationary phase, clumping, or instrument saturation','At least three positive blank-corrected values are required; residual diagnostics are returned for review'],
'[]'::jsonb,'active')
on conflict (organization_id,domain,formula_code,formula_version) do update set
implementation_key=excluded.implementation_key,output_metric_code=excluded.output_metric_code,
output_unit_code=excluded.output_unit_code,input_contract=excluded.input_contract,
formula_definition=excluded.formula_definition,assumptions=excluded.assumptions,
limitations=excluded.limitations,status='active',updated_at=now();
;
