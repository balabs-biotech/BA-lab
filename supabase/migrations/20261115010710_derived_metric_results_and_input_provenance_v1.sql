
alter table public.batch_performance_observations
  add constraint batch_performance_observations_org_id_unique unique (organization_id,id);

create table public.derived_metric_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null check (domain in ('mycology','greentech','lab')),
  subject_kind text not null,
  subject_id uuid,
  metric_code text not null references public.variables(code),
  numeric_value numeric,
  text_value text,
  unit_code text references public.units(code),
  formula_code text not null,
  formula_version text not null,
  derivation_status text not null default 'calculated'
    check (derivation_status in ('calculated','invalidated','superseded','rejected')),
  quality_state public.quality_state not null default 'raw',
  computed_at timestamptz not null default now(),
  input_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(input_snapshot) = 'object'),
  limitations text[] not null default '{}',
  idempotency_key text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint derived_metric_result_value_present check (numeric_value is not null or text_value is not null),
  constraint derived_metric_result_key_unique unique (organization_id, idempotency_key),
  constraint derived_metric_result_org_id_unique unique (organization_id, id)
);

create index derived_metric_results_subject_idx
  on public.derived_metric_results (organization_id, domain, subject_kind, subject_id, computed_at desc);
create index derived_metric_results_metric_idx
  on public.derived_metric_results (organization_id, metric_code, computed_at desc);

create table public.derived_metric_inputs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  derived_metric_result_id uuid not null,
  source_measurement_id uuid,
  source_batch_performance_observation_id uuid,
  input_role text not null default 'input',
  created_at timestamptz not null default now(),
  constraint derived_metric_inputs_one_source check (
    (source_measurement_id is not null)::int +
    (source_batch_performance_observation_id is not null)::int = 1
  ),
  constraint derived_metric_inputs_result_fk foreign key (organization_id, derived_metric_result_id)
    references public.derived_metric_results(organization_id, id) on delete cascade,
  constraint derived_metric_inputs_measurement_fk foreign key (organization_id, source_measurement_id)
    references public.measurements(organization_id, id) on delete restrict,
  constraint derived_metric_inputs_batch_observation_fk foreign key (organization_id, source_batch_performance_observation_id)
    references public.batch_performance_observations(organization_id, id) on delete restrict,
  constraint derived_metric_inputs_measurement_unique unique (derived_metric_result_id, source_measurement_id),
  constraint derived_metric_inputs_batch_unique unique (derived_metric_result_id, source_batch_performance_observation_id)
);

create index derived_metric_inputs_measurement_idx
  on public.derived_metric_inputs (organization_id, source_measurement_id)
  where source_measurement_id is not null;
create index derived_metric_inputs_batch_idx
  on public.derived_metric_inputs (organization_id, source_batch_performance_observation_id)
  where source_batch_performance_observation_id is not null;

alter table public.derived_metric_results enable row level security;
alter table public.derived_metric_inputs enable row level security;

create policy derived_metric_results_select_member on public.derived_metric_results for select to authenticated
using (exists (select 1 from public.organization_members om where om.organization_id=derived_metric_results.organization_id and om.user_id=(select auth.uid())));
create policy derived_metric_results_insert_member on public.derived_metric_results for insert to authenticated
with check (exists (select 1 from public.organization_members om where om.organization_id=derived_metric_results.organization_id and om.user_id=(select auth.uid())));
create policy derived_metric_results_update_member on public.derived_metric_results for update to authenticated
using (exists (select 1 from public.organization_members om where om.organization_id=derived_metric_results.organization_id and om.user_id=(select auth.uid())))
with check (exists (select 1 from public.organization_members om where om.organization_id=derived_metric_results.organization_id and om.user_id=(select auth.uid())));
create policy derived_metric_results_delete_admin on public.derived_metric_results for delete to authenticated
using (exists (select 1 from public.organization_members om where om.organization_id=derived_metric_results.organization_id and om.user_id=(select auth.uid()) and om.role in ('owner','admin')));

create policy derived_metric_inputs_select_member on public.derived_metric_inputs for select to authenticated
using (exists (select 1 from public.organization_members om where om.organization_id=derived_metric_inputs.organization_id and om.user_id=(select auth.uid())));
create policy derived_metric_inputs_insert_member on public.derived_metric_inputs for insert to authenticated
with check (exists (select 1 from public.organization_members om where om.organization_id=derived_metric_inputs.organization_id and om.user_id=(select auth.uid())));
create policy derived_metric_inputs_delete_admin on public.derived_metric_inputs for delete to authenticated
using (exists (select 1 from public.organization_members om where om.organization_id=derived_metric_inputs.organization_id and om.user_id=(select auth.uid())));
;
