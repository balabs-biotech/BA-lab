create index if not exists derived_formula_registry_output_metric_idx on public.derived_formula_registry(output_metric_code);
create index if not exists derived_formula_registry_output_unit_idx on public.derived_formula_registry(output_unit_code) where output_unit_code is not null;
