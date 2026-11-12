-- Link a documented recommendation outcome to quantitative measurements
-- from the same biological subject or its cultivation environment.
-- The link is explicit, tenant-scoped, append-only and never inferred.

create table public.biological_recommendation_outcome_measurements (
  organization_id uuid not null,
  recommendation_id uuid not null,
  outcome_event_id uuid not null,
  measurement_id uuid not null,
  measurement_observed_at timestamptz not null,
  variable_code text not null,
  normalized_value numeric,
  normalized_unit_code text,
  raw_value numeric,
  raw_unit_code text,
  measurement_quality_state text not null default 'raw' check (
    measurement_quality_state in (
      'raw', 'controlled', 'validated', 'excluded'
    )
  ),
  method text,
  instrument text,
  source_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_metadata) = 'object'),
  evidence_scope text not null check (
    evidence_scope in ('biological_subject', 'environmental_context')
  ),
  linked_by uuid not null,
  linked_at timestamptz not null default now(),
  primary key (
    organization_id, recommendation_id, outcome_event_id, measurement_id
  ),
  constraint biological_recommendation_outcome_measurements_event_fk
    foreign key (organization_id, recommendation_id, outcome_event_id)
    references public.biological_recommendation_events (
      organization_id, recommendation_id, event_id
    ) on delete restrict,
  constraint biological_recommendation_outcome_measurements_measurement_fk
    foreign key (organization_id, measurement_id)
    references public.measurements (organization_id, id) on delete restrict
);

create index biological_recommendation_outcome_measurements_measurement_idx
  on public.biological_recommendation_outcome_measurements (
    organization_id, measurement_id
  );

alter table public.biological_recommendation_outcome_measurements
  enable row level security;

create policy biological_recommendation_outcome_measurements_select
  on public.biological_recommendation_outcome_measurements
  for select to authenticated
  using (private.is_org_member(organization_id));

revoke all on public.biological_recommendation_outcome_measurements
  from public, anon, authenticated, service_role;
grant select on public.biological_recommendation_outcome_measurements
  to authenticated;

create or replace function private.prevent_biological_recommendation_outcome_measurement_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'biological_recommendation_outcome_measurement_links_are_append_only'
    using errcode = '23514';
end;
$$;

revoke all on function private.prevent_biological_recommendation_outcome_measurement_mutation()
  from public, anon, authenticated;

create trigger biological_recommendation_outcome_measurements_append_only
before update or delete on public.biological_recommendation_outcome_measurements
for each row execute function private.prevent_biological_recommendation_outcome_measurement_mutation();

create or replace function public.link_biological_recommendation_outcome_measurement(
  p_organization_id uuid,
  p_recommendation_id uuid,
  p_measurement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_recommendation public.biological_recommendations%rowtype;
  v_signal public.biological_signals%rowtype;
  v_measurement public.measurements%rowtype;
  v_execution_at timestamptz;
  v_outcome_event public.biological_recommendation_events%rowtype;
  v_scope text;
  v_link public.biological_recommendation_outcome_measurements%rowtype;
  v_inserted boolean := false;
  v_inserted_rows integer := 0;
begin
  if v_actor_id is null or p_organization_id is null
     or not private.is_org_writer(p_organization_id) then
    raise exception 'biological_recommendation_evidence_write_forbidden'
      using errcode = '42501';
  end if;

  if p_recommendation_id is null or p_measurement_id is null then
    raise exception 'biological_recommendation_evidence_required'
      using errcode = '22023';
  end if;

  select r.* into v_recommendation
    from public.biological_recommendations r
   where r.organization_id = p_organization_id
     and r.recommendation_id = p_recommendation_id
   for update;

  if not found then
    raise exception 'biological_recommendation_not_found'
      using errcode = 'P0002';
  end if;

  if v_recommendation.lifecycle_status <> 'outcome_recorded' then
    raise exception 'biological_recommendation_outcome_not_recorded'
      using errcode = '23514';
  end if;

  select s.* into v_signal
    from public.biological_signals s
   where s.organization_id = p_organization_id
     and s.signal_id = v_recommendation.source_signal_id;

  if not found then
    raise exception 'biological_recommendation_source_signal_not_found'
      using errcode = 'P0002';
  end if;

  select e.* into v_outcome_event
    from public.biological_recommendation_events e
   where e.organization_id = p_organization_id
     and e.recommendation_id = p_recommendation_id
     and e.action = 'record_outcome';

  select e.occurred_at into v_execution_at
    from public.biological_recommendation_events e
   where e.organization_id = p_organization_id
     and e.recommendation_id = p_recommendation_id
     and e.action = 'record_execution';

  if v_outcome_event.event_id is null or v_execution_at is null
     or v_outcome_event.outcome_observed_at is null then
    raise exception 'biological_recommendation_outcome_provenance_incomplete'
      using errcode = '23514';
  end if;

  select m.* into v_measurement
    from public.measurements m
   where m.organization_id = p_organization_id
     and m.id = p_measurement_id;

  if not found then
    raise exception 'biological_recommendation_measurement_not_found'
      using errcode = 'P0002';
  end if;

  if v_measurement.measured_at is null then
    raise exception 'biological_recommendation_measurement_timestamp_missing'
      using errcode = '23514';
  end if;

  if v_measurement.measured_at < v_execution_at
     or v_measurement.measured_at > v_outcome_event.outcome_observed_at then
    raise exception 'biological_recommendation_measurement_outside_outcome_window'
      using errcode = '23514';
  end if;

  if v_measurement.culture_id = v_signal.biological_subject_id
     or v_measurement.plant_culture_id = v_signal.biological_subject_id then
    v_scope := 'biological_subject';
  elsif v_measurement.environment_id = v_signal.environment_id then
    v_scope := 'environmental_context';
  else
    raise exception 'biological_recommendation_measurement_context_mismatch'
      using errcode = '23514';
  end if;

  insert into public.biological_recommendation_outcome_measurements (
    organization_id, recommendation_id, outcome_event_id,
    measurement_id, measurement_observed_at, variable_code,
    normalized_value, normalized_unit_code, raw_value, raw_unit_code,
    measurement_quality_state, method, instrument, source_metadata, evidence_scope, linked_by
  ) values (
    p_organization_id, p_recommendation_id, v_outcome_event.event_id,
    p_measurement_id, v_measurement.measured_at, v_measurement.variable_code,
    v_measurement.normalized_value, v_measurement.normalized_unit_code,
    v_measurement.raw_value, v_measurement.raw_unit_code,
    coalesce(v_measurement.quality_state::text, 'raw'), v_measurement.method, v_measurement.instrument,
    coalesce(v_measurement.metadata, '{}'::jsonb), v_scope, v_actor_id
  )
  on conflict (
    organization_id, recommendation_id, outcome_event_id, measurement_id
  ) do nothing;

  get diagnostics v_inserted_rows = row_count;
  v_inserted := v_inserted_rows > 0;
  select l.* into v_link
    from public.biological_recommendation_outcome_measurements l
   where l.organization_id = p_organization_id
     and l.recommendation_id = p_recommendation_id
     and l.outcome_event_id = v_outcome_event.event_id
     and l.measurement_id = p_measurement_id;

  if v_link.evidence_scope is distinct from v_scope then
    raise exception 'biological_recommendation_evidence_link_conflict'
      using errcode = '23505';
  end if;

  return jsonb_build_object(
    'evidence_link', to_jsonb(v_link),
    'idempotent_replay', not v_inserted
  );
end;
$$;

revoke all on function public.link_biological_recommendation_outcome_measurement(
  uuid, uuid, uuid
) from public, anon;
grant execute on function public.link_biological_recommendation_outcome_measurement(
  uuid, uuid, uuid
) to authenticated;

comment on table public.biological_recommendation_outcome_measurements is
  'Explicit append-only links from documented recommendation outcomes to same-tenant quantitative measurements in the recommendation subject or environment context. These links establish traceability, not causality.';
comment on function public.link_biological_recommendation_outcome_measurement(
  uuid, uuid, uuid
) is
  'Links one existing measurement to a recorded recommendation outcome only when tenant, biological/environmental context and execution-to-outcome time window match.';
