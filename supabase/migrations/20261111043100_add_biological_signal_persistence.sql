-- Persist engine-generated biological interpretation signals as traceable,
-- tenant-scoped events. This migration intentionally follows the profile registry
-- migrations already applied to the active project.
--
-- The context table's primary key differs across historical schema generations.
-- This explicit composite key gives signal provenance a stable tenant/context/
-- environment/domain reference in either generation.

create unique index if not exists biological_contexts_signal_context_key
  on public.biological_contexts
  (organization_id, id, environment_id, domain);

create table public.biological_signals (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signal_id uuid not null,
  domain text not null check (domain in ('mycology', 'greentech', 'lab')),
  signal_code text not null check (length(btrim(signal_code)) between 1 and 100),
  severity text not null check (severity in ('info', 'low', 'moderate', 'high', 'critical')),
  message_code text not null check (length(btrim(message_code)) between 1 and 120),
  recommendation_code text check (
    recommendation_code is null or length(recommendation_code) <= 120
  ),
  rule_id text not null check (length(btrim(rule_id)) between 1 and 100),
  source_analysis_id uuid not null,
  source_finding_id uuid not null,
  biological_context_id uuid not null,
  biological_subject_id uuid not null,
  environment_id uuid not null,
  domain_profile_code text not null,
  domain_profile_version text not null,
  environment_profile_code text not null,
  environment_profile_version text not null,
  variable_code text not null check (length(btrim(variable_code)) between 1 and 120),
  observed_date date not null,
  observed_value numeric,
  unit text not null check (length(btrim(unit)) between 1 and 40),
  finding_status text not null check (finding_status in (
    'normal', 'suspect', 'insufficient_history',
    'insufficient_coverage', 'indeterminate'
  )),
  source_observation_ids jsonb not null default '[]'::jsonb,
  context_tags jsonb not null default '[]'::jsonb,
  signal_status text not null default 'open'
    check (signal_status in ('open', 'acknowledged', 'resolved', 'dismissed')),
  first_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  primary key (organization_id, signal_id),
  constraint biological_signals_source_analysis_fk
    foreign key (organization_id, source_analysis_id)
    references public.analyses (organization_id, id) on delete restrict,
  constraint biological_signals_context_fk
    foreign key (
      organization_id, biological_context_id, environment_id, domain
    )
    references public.biological_contexts (
      organization_id, id, environment_id, domain
    ) on delete restrict,
  constraint biological_signals_domain_profile_fk
    foreign key (
      organization_id, domain, domain_profile_code, domain_profile_version
    )
    references public.domain_interpretation_profiles (
      organization_id, domain, profile_code, profile_version
    ) on delete restrict,
  constraint biological_signals_environment_profile_fk
    foreign key (
      organization_id, environment_id,
      environment_profile_code, environment_profile_version
    )
    references public.environment_context_profiles (
      organization_id, environment_id, profile_code, profile_version
    ) on delete restrict,
  constraint biological_signals_observation_ids_array_check
    check (
      jsonb_typeof(source_observation_ids) = 'array'
      and not jsonb_path_exists(source_observation_ids, '$[*] ? (@.type() != "string")')
    ),
  constraint biological_signals_context_tags_array_check
    check (
      jsonb_typeof(context_tags) = 'array'
      and not jsonb_path_exists(context_tags, '$[*] ? (@.type() != "string")')
    ),
  constraint biological_signals_acknowledgement_state_check
    check (
      (signal_status <> 'acknowledged' or acknowledged_at is not null)
      and (signal_status <> 'resolved' or resolved_at is not null)
    ),
  constraint biological_signals_tenant_idempotency_key
    unique (
      organization_id, source_analysis_id, source_finding_id, rule_id,
      biological_context_id, domain_profile_code, domain_profile_version,
      environment_profile_code, environment_profile_version
    )
);

create index biological_signals_inbox_idx
  on public.biological_signals (
    organization_id, signal_status, severity, observed_date desc
  );

create index biological_signals_subject_history_idx
  on public.biological_signals (
    organization_id, biological_subject_id, observed_date desc
  );

create index biological_signals_environment_history_idx
  on public.biological_signals (
    organization_id, environment_id, observed_date desc
  );

-- Normalize observation provenance into tenant-scoped relational links. The
-- JSONB array remains a portable snapshot, while this table proves that every
-- referenced observation belongs to the same organization.
create table public.biological_signal_observations (
  organization_id uuid not null,
  signal_id uuid not null,
  observation_id uuid not null,
  primary key (organization_id, signal_id, observation_id),
  constraint biological_signal_observations_signal_fk
    foreign key (organization_id, signal_id)
    references public.biological_signals (organization_id, signal_id)
    on delete cascade,
  constraint biological_signal_observations_observation_fk
    foreign key (organization_id, observation_id)
    references public.observations (organization_id, id)
    on delete restrict
);

create index biological_signal_observations_observation_idx
  on public.biological_signal_observations (organization_id, observation_id);

alter table public.biological_signal_observations enable row level security;

create policy biological_signal_observations_select
  on public.biological_signal_observations
  for select to authenticated
  using (private.is_org_member(organization_id));

revoke all on public.biological_signal_observations from public, anon, authenticated;
grant select on public.biological_signal_observations to authenticated;
grant select, insert, delete on public.biological_signal_observations to service_role;

create or replace function private.link_biological_signal_observations()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $
declare
  v_observation_id uuid;
begin
  for v_observation_id in
    select value::uuid
      from jsonb_array_elements_text(new.source_observation_ids) as item(value)
  loop
    insert into public.biological_signal_observations (
      organization_id, signal_id, observation_id
    )
    values (
      new.organization_id, new.signal_id, v_observation_id
    )
    on conflict (organization_id, signal_id, observation_id) do nothing;
  end loop;

  return new;
end;
$;

revoke all on function private.link_biological_signal_observations()
  from public, anon, authenticated;

create trigger biological_signals_link_observations
  after insert on public.biological_signals
  for each row execute function private.link_biological_signal_observations();

alter table public.biological_signals enable row level security;

create policy biological_signals_select
  on public.biological_signals
  for select to authenticated
  using (private.is_org_member(organization_id));

revoke all on public.biological_signals from public, anon, authenticated;
grant select on public.biological_signals to authenticated;
grant select, insert, update on public.biological_signals to service_role;

comment on table public.biological_signals is
  'Persisted biological interpretation events. Every row retains its analysis, finding, biological context, environment profile and domain-rule profile lineage.';
comment on column public.biological_signals.signal_status is
  'Operational inbox state for CultureOps; open by default. Engine-generated content and provenance remain separate from user acknowledgement state.';
comment on constraint biological_signals_tenant_idempotency_key on public.biological_signals is
  'Prevents duplicate persistence when the same analysis is retried with the same biological and profile versions.';
