create index if not exists derived_metric_inputs_result_fk_idx on public.derived_metric_inputs (organization_id, derived_metric_result_id);
create index if not exists derived_metric_results_created_by_idx on public.derived_metric_results (created_by) where created_by is not null;
create index if not exists derived_metric_results_metric_fk_idx on public.derived_metric_results (metric_code);
create index if not exists derived_metric_results_unit_fk_idx on public.derived_metric_results (unit_code) where unit_code is not null;
