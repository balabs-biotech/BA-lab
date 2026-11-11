-- Persist biological recommendation proposals and their human-review events.
-- Signal inbox state remains a separate workflow; recommendations have their
-- own immutable proposal snapshot and append-only decision history.

create table public.biological_recommendations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recommendation_id uuid not null,
  recommendation_code text not null check (length(btrim(recommendation_code)) between 1 and 120),
  profile_id text not null check (length(btrim(profile_id)) between 1 and 100),
  profile_version text not null check (length(btrim(profile_version)) between 1 and 32),
  module text not null check (module in ('mycology', 'greentech', 'lab')),
  source_signal_id uuid not null,
  source_analysis_id uuid not null,
  source_finding_id uuid not null,
  instruction_code text check (instruction_code is null or length(instruction_code) <= 120),
  rationale_code text check (rationale_code is null or length(rationale_code) <= 120),
  proposal_status text not null check (proposal_status in ('proposed', 'withheld')),
  withholding_reasons jsonb not null default '[]'::jsonb,
  requires_human_review boolean not null default true check (requires_human_review),
  auto_execute boolean not null default false check (not auto_execute),
  lifecycle_status text not null check (lifecycle_status in (
    'proposed', 'withheld', 'accepted', 'rejected', 'executed', 'outcome_recorded'
  )),
  revision integer not null default 0 check (revision >= 0),
  execution_details text,
  outcome_summary text,
  outcome_observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, recommendation_id),
  constraint biological_recommendations_source_signal_fk
    foreign key (organization_id, source_signal_id)
    references public.biological_signals (organization_id, signal_id) on delete restrict,
  constraint biological_recommendations_source_analysis_fk
    foreign key (organization_id, source_analysis_id)
    references public.analyses (organization_id, id) on delete restrict,
  constraint biological_recommendations_profile_fk
    foreign key (organization_id, module, profile_id, profile_version)
    references public.domain_interpretation_profiles (
      organization_id, domain, profile_code, profile_version
    ) on delete restrict,
  constraint biological_recommendations_withholding_reasons_check
    check (
      jsonb_typeof(withholding_reasons) = 'array'
      and not jsonb_path_exists(withholding_reasons, '$[*] ? (@.type() != "string")')
      and (
        (proposal_status = 'proposed' and jsonb_array_length(withholding_reasons) = 0)
        or (proposal_status = 'withheld' and jsonb_array_length(withholding_reasons) > 0)
      )
    ),
  constraint biological_recommendations_initial_state_check
    check (
      (proposal_status = 'proposed' and lifecycle_status in (
        'proposed', 'accepted', 'rejected', 'executed', 'outcome_recorded'
      ))
      or (proposal_status = 'withheld' and lifecycle_status = 'withheld')
    ),
  constraint biological_recommendations_revision_state_check
    check (
      (lifecycle_status in ('proposed', 'withheld') and revision = 0)
      or (lifecycle_status = 'rejected' and revision = 1)
      or (lifecycle_status = 'accepted' and revision = 1)
      or (lifecycle_status = 'executed' and revision = 2)
      or (lifecycle_status = 'outcome_recorded' and revision = 3)
    )
);

create index biological_recommendations_review_queue_idx
  on public.biological_recommendations (organization_id, lifecycle_status, created_at desc);

create index biological_recommendations_source_signal_idx
  on public.biological_recommendations (organization_id, source_signal_id);

create table public.biological_recommendation_events (
  organization_id uuid not null,
  recommendation_id uuid not null,
  event_id uuid not null,
  action text not null check (action in ('accept', 'reject', 'record_execution', 'record_outcome')),
  actor_id uuid not null,
  occurred_at timestamptz not null,
  note text check (note is null or length(note) <= 2000),
  execution_details text check (execution_details is null or length(execution_details) <= 4000),
  outcome_summary text check (outcome_summary is null or length(outcome_summary) <= 4000),
  outcome_observed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (organization_id, recommendation_id, event_id),
  constraint biological_recommendation_events_idempotency_key
    unique (organization_id, event_id),
  constraint biological_recommendation_events_recommendation_fk
    foreign key (organization_id, recommendation_id)
    references public.biological_recommendations (organization_id, recommendation_id)
    on delete restrict,
  constraint biological_recommendation_events_payload_check
    check (
      (action = 'record_execution'
        and length(btrim(execution_details)) > 0
        and outcome_summary is null and outcome_observed_at is null)
      or
      (action = 'record_outcome'
        and execution_details is null
        and length(btrim(outcome_summary)) > 0
        and outcome_observed_at is not null)
      or
      (action in ('accept', 'reject')
        and execution_details is null
        and outcome_summary is null
        and outcome_observed_at is null)
    )
);

create index biological_recommendation_events_timeline_idx
  on public.biological_recommendation_events (
    organization_id, recommendation_id, occurred_at, event_id
  );

alter table public.biological_recommendations enable row level security;
alter table public.biological_recommendation_events enable row level security;

create policy biological_recommendations_select
  on public.biological_recommendations
  for select to authenticated
  using (private.is_org_member(organization_id));

create policy biological_recommendation_events_select
  on public.biological_recommendation_events
  for select to authenticated
  using (private.is_org_member(organization_id));

revoke all on public.biological_recommendations,
  public.biological_recommendation_events
  from public, anon, authenticated, service_role;
grant select on public.biological_recommendations,
  public.biological_recommendation_events to authenticated;

create or replace function private.guard_biological_recommendation_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (to_jsonb(new) - array[
    'lifecycle_status', 'revision', 'execution_details',
    'outcome_summary', 'outcome_observed_at', 'updated_at'
  ]) is distinct from (to_jsonb(old) - array[
    'lifecycle_status', 'revision', 'execution_details',
    'outcome_summary', 'outcome_observed_at', 'updated_at'
  ]) then
    raise exception 'biological_recommendation_proposal_is_immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger biological_recommendations_snapshot_immutable
before update on public.biological_recommendations
for each row execute function private.guard_biological_recommendation_snapshot();

create or replace function private.prevent_biological_recommendation_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'biological_recommendation_events_are_append_only'
    using errcode = '23514';
end;
$$;

create trigger biological_recommendation_events_append_only
before update or delete on public.biological_recommendation_events
for each row execute function private.prevent_biological_recommendation_event_mutation();

create or replace function public.create_biological_recommendation(
  p_organization_id uuid,
  p_recommendation_id uuid,
  p_recommendation_code text,
  p_profile_id text,
  p_profile_version text,
  p_module text,
  p_source_signal_id uuid,
  p_source_analysis_id uuid,
  p_source_finding_id uuid,
  p_instruction_code text,
  p_rationale_code text,
  p_proposal_status text,
  p_withholding_reasons jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_signal public.biological_signals%rowtype;
  v_recommendation public.biological_recommendations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'biological_recommendation_create_forbidden'
      using errcode = '42501';
  end if;

  if p_proposal_status is null or p_proposal_status not in ('proposed', 'withheld')
     or p_withholding_reasons is null
     or jsonb_typeof(p_withholding_reasons) <> 'array'
     or jsonb_path_exists(p_withholding_reasons, '$[*] ? (@.type() != "string")') then
    raise exception 'invalid_biological_recommendation_proposal'
      using errcode = '23514';
  end if;

  if (p_proposal_status = 'proposed'
      and (jsonb_array_length(p_withholding_reasons) <> 0
        or p_instruction_code is null or p_rationale_code is null))
     or (p_proposal_status = 'withheld'
      and jsonb_array_length(p_withholding_reasons) = 0) then
    raise exception 'biological_recommendation_withholding_contract_invalid'
      using errcode = '23514';
  end if;

  select bs.* into v_signal
    from public.biological_signals bs
   where bs.organization_id = p_organization_id
     and bs.signal_id = p_source_signal_id;

  if not found
     or v_signal.source_analysis_id is distinct from p_source_analysis_id
     or v_signal.source_finding_id is distinct from p_source_finding_id
     or v_signal.domain is distinct from p_module
     or v_signal.domain_profile_code is distinct from p_profile_id
     or v_signal.domain_profile_version is distinct from p_profile_version
     or v_signal.recommendation_code is distinct from p_recommendation_code then
    raise exception 'biological_recommendation_source_provenance_mismatch'
      using errcode = '23514';
  end if;

  insert into public.biological_recommendations (
    organization_id, recommendation_id, recommendation_code,
    profile_id, profile_version, module,
    source_signal_id, source_analysis_id, source_finding_id,
    instruction_code, rationale_code, proposal_status,
    withholding_reasons, lifecycle_status
  ) values (
    p_organization_id, p_recommendation_id, p_recommendation_code,
    p_profile_id, p_profile_version, p_module,
    p_source_signal_id, p_source_analysis_id, p_source_finding_id,
    p_instruction_code, p_rationale_code, p_proposal_status,
    p_withholding_reasons, p_proposal_status
  )
  returning * into v_recommendation;

  return jsonb_build_object(
    'recommendation', to_jsonb(v_recommendation),
    'events', '[]'::jsonb
  );
end;
$$;

create or replace function public.transition_biological_recommendation(
  p_organization_id uuid,
  p_recommendation_id uuid,
  p_expected_revision integer,
  p_event_id uuid,
  p_action text,
  p_occurred_at timestamptz,
  p_note text default null,
  p_execution_details text default null,
  p_outcome_summary text default null,
  p_outcome_observed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_recommendation public.biological_recommendations%rowtype;
  v_existing public.biological_recommendation_events%rowtype;
  v_event public.biological_recommendation_events%rowtype;
  v_last_event_at timestamptz;
  v_execution_at timestamptz;
  v_next_status text;
begin
  if v_actor_id is null or not private.is_org_writer(p_organization_id) then
    raise exception 'biological_recommendation_write_forbidden'
      using errcode = '42501';
  end if;

  if p_event_id is null or p_occurred_at is null
     or p_occurred_at > now() + interval '5 minutes'
     or p_action is null
     or p_action not in ('accept', 'reject', 'record_execution', 'record_outcome') then
    raise exception 'invalid_biological_recommendation_event'
      using errcode = '23514';
  end if;

  if (p_action = 'record_execution'
      and (p_execution_details is null or length(btrim(p_execution_details)) = 0
        or p_outcome_summary is not null or p_outcome_observed_at is not null))
     or (p_action = 'record_outcome'
      and (p_execution_details is not null
        or p_outcome_summary is null or length(btrim(p_outcome_summary)) = 0
        or p_outcome_observed_at is null))
     or (p_action in ('accept', 'reject')
      and (p_execution_details is not null
        or p_outcome_summary is not null or p_outcome_observed_at is not null)) then
    raise exception 'invalid_biological_recommendation_event_payload'
      using errcode = '23514';
  end if;

  -- Serialize reuse of an event UUID within an organization. This makes
  -- concurrent identical retries idempotent even when they target one row.
  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_event_id::text, 0)
  );

  select e.* into v_existing
    from public.biological_recommendation_events e
   where e.organization_id = p_organization_id
     and e.event_id = p_event_id;

  if found then
    if v_existing.recommendation_id is distinct from p_recommendation_id
       or v_existing.action is distinct from p_action
       or v_existing.actor_id is distinct from v_actor_id
       or v_existing.occurred_at is distinct from p_occurred_at
       or v_existing.note is distinct from p_note
       or v_existing.execution_details is distinct from p_execution_details
       or v_existing.outcome_summary is distinct from p_outcome_summary
       or v_existing.outcome_observed_at is distinct from p_outcome_observed_at then
      raise exception 'biological_recommendation_event_idempotency_conflict'
        using errcode = '23505';
    end if;

    select r.* into v_recommendation
      from public.biological_recommendations r
     where r.organization_id = p_organization_id
       and r.recommendation_id = p_recommendation_id;

    return jsonb_build_object(
      'recommendation', to_jsonb(v_recommendation),
      'event', to_jsonb(v_existing),
      'idempotent_replay', true
    );
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

  if v_recommendation.revision <> p_expected_revision then
    raise exception 'biological_recommendation_revision_conflict'
      using errcode = '40001';
  end if;

  v_next_status := case
    when v_recommendation.lifecycle_status = 'proposed' and p_action = 'accept' then 'accepted'
    when v_recommendation.lifecycle_status = 'proposed' and p_action = 'reject' then 'rejected'
    when v_recommendation.lifecycle_status = 'accepted' and p_action = 'record_execution' then 'executed'
    when v_recommendation.lifecycle_status = 'executed' and p_action = 'record_outcome' then 'outcome_recorded'
    else null
  end;

  if v_next_status is null then
    raise exception 'invalid_biological_recommendation_transition'
      using errcode = '23514';
  end if;

  select max(e.occurred_at) into v_last_event_at
    from public.biological_recommendation_events e
   where e.organization_id = p_organization_id
     and e.recommendation_id = p_recommendation_id;

  if v_last_event_at is not null and p_occurred_at < v_last_event_at then
    raise exception 'biological_recommendation_event_time_reversed'
      using errcode = '23514';
  end if;

  if p_action = 'record_outcome' then
    select e.occurred_at into v_execution_at
      from public.biological_recommendation_events e
     where e.organization_id = p_organization_id
       and e.recommendation_id = p_recommendation_id
       and e.action = 'record_execution';

    if v_execution_at is null
       or p_outcome_observed_at < v_execution_at
       or p_outcome_observed_at > p_occurred_at then
      raise exception 'biological_recommendation_outcome_time_invalid'
        using errcode = '23514';
    end if;
  end if;

  insert into public.biological_recommendation_events (
    organization_id, recommendation_id, event_id, action,
    actor_id, occurred_at, note, execution_details,
    outcome_summary, outcome_observed_at
  ) values (
    p_organization_id, p_recommendation_id, p_event_id, p_action,
    v_actor_id, p_occurred_at, p_note, p_execution_details,
    p_outcome_summary, p_outcome_observed_at
  )
  returning * into v_event;

  update public.biological_recommendations r
     set lifecycle_status = v_next_status,
         revision = revision + 1,
         execution_details = case
           when p_action = 'record_execution' then p_execution_details
           else execution_details
         end,
         outcome_summary = case
           when p_action = 'record_outcome' then p_outcome_summary
           else outcome_summary
         end,
         outcome_observed_at = case
           when p_action = 'record_outcome' then p_outcome_observed_at
           else outcome_observed_at
         end,
         updated_at = now()
   where r.organization_id = p_organization_id
     and r.recommendation_id = p_recommendation_id
  returning * into v_recommendation;

  return jsonb_build_object(
    'recommendation', to_jsonb(v_recommendation),
    'event', to_jsonb(v_event),
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.create_biological_recommendation(
  uuid, uuid, text, text, text, text, uuid, uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_biological_recommendation(
  uuid, uuid, text, text, text, text, uuid, uuid, uuid, text, text, text, jsonb
) to service_role;

revoke all on function public.transition_biological_recommendation(
  uuid, uuid, integer, uuid, text, timestamptz, text, text, text, timestamptz
) from public, anon;
grant execute on function public.transition_biological_recommendation(
  uuid, uuid, integer, uuid, text, timestamptz, text, text, text, timestamptz
) to authenticated;

comment on table public.biological_recommendations is
  'Immutable biological recommendation proposal snapshot with a transactionally maintained human-review lifecycle projection.';
comment on table public.biological_recommendation_events is
  'Append-only, actor-attributed audit history for recommendation acceptance, rejection, execution and outcome recording.';
comment on function public.transition_biological_recommendation(
  uuid, uuid, integer, uuid, text, timestamptz, text, text, text, timestamptz
) is
  'Atomically validates organization writer access, expected revision, lifecycle transition and event idempotency before appending one human decision.';
