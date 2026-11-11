-- Immutable, versioned snapshots of biological interpretations with append-only history.
-- The snapshot derives its biological and source identity from the persisted signal;
-- callers cannot substitute a different culture, analysis, or finding.

create table public.biological_interpretations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  interpretation_id uuid not null,
  domain text not null check (domain in ('mycology', 'greentech', 'lab')),
  biological_subject_id uuid not null,
  source_signal_id uuid not null,
  source_analysis_id uuid not null,
  source_finding_id uuid not null,
  engine_code text not null check (length(btrim(engine_code)) between 1 and 100),
  engine_version text not null check (length(btrim(engine_version)) between 1 and 64),
  interpretation_status text not null check (interpretation_status in (
    'observed_only', 'supporting_evidence', 'discordant_evidence',
    'insufficient_evidence', 'requires_review'
  )),
  interpretation_payload jsonb not null check (jsonb_typeof(interpretation_payload) = 'object'),
  recorded_at timestamptz not null default now(),
  primary key (organization_id, interpretation_id),
  constraint biological_interpretations_engine_snapshot_key
    unique (organization_id, source_signal_id, engine_code, engine_version),
  constraint biological_interpretations_signal_fk
    foreign key (organization_id, source_signal_id)
    references public.biological_signals (organization_id, signal_id) on delete restrict,
  constraint biological_interpretations_analysis_fk
    foreign key (organization_id, source_analysis_id)
    references public.analyses (organization_id, id) on delete restrict
);

create index biological_interpretations_subject_history_idx
  on public.biological_interpretations (
    organization_id, biological_subject_id, recorded_at desc
  );

create index biological_interpretations_signal_history_idx
  on public.biological_interpretations (
    organization_id, source_signal_id, recorded_at desc
  );

create table public.biological_interpretation_events (
  organization_id uuid not null,
  interpretation_id uuid not null,
  event_id uuid not null,
  event_type text not null check (event_type in ('recorded', 'reviewed', 'superseded', 'note_added')),
  actor_kind text not null check (actor_kind in ('system', 'user')),
  actor_id uuid,
  occurred_at timestamptz not null default now(),
  event_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_payload) = 'object'),
  primary key (organization_id, interpretation_id, event_id),
  constraint biological_interpretation_events_idempotency_key
    unique (organization_id, event_id),
  constraint biological_interpretation_events_snapshot_fk
    foreign key (organization_id, interpretation_id)
    references public.biological_interpretations (organization_id, interpretation_id)
    on delete restrict,
  constraint biological_interpretation_events_actor_check
    check ((actor_kind = 'system' and actor_id is null)
      or (actor_kind = 'user' and actor_id is not null))
);

create index biological_interpretation_events_timeline_idx
  on public.biological_interpretation_events (
    organization_id, interpretation_id, occurred_at, event_id
  );

alter table public.biological_interpretations enable row level security;
alter table public.biological_interpretation_events enable row level security;

create policy biological_interpretations_select
  on public.biological_interpretations
  for select to authenticated
  using (private.is_org_member(organization_id));

create policy biological_interpretation_events_select
  on public.biological_interpretation_events
  for select to authenticated
  using (private.is_org_member(organization_id));

revoke all on public.biological_interpretations,
  public.biological_interpretation_events
  from public, anon, authenticated, service_role;
grant select on public.biological_interpretations,
  public.biological_interpretation_events to authenticated;

create or replace function private.prevent_biological_interpretation_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'biological_interpretation_records_are_immutable'
    using errcode = '23514';
end;
$$;

create trigger biological_interpretations_immutable
before update or delete on public.biological_interpretations
for each row execute function private.prevent_biological_interpretation_mutation();

create trigger biological_interpretation_events_append_only
before update or delete on public.biological_interpretation_events
for each row execute function private.prevent_biological_interpretation_mutation();

create or replace function public.record_biological_interpretation(
  p_organization_id uuid,
  p_interpretation_id uuid,
  p_event_id uuid,
  p_source_signal_id uuid,
  p_engine_code text,
  p_engine_version text,
  p_interpretation_status text,
  p_interpretation_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_signal public.biological_signals%rowtype;
  v_snapshot public.biological_interpretations%rowtype;
  v_inserted boolean := false;
  v_rows integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'biological_interpretation_record_forbidden'
      using errcode = '42501';
  end if;

  if p_organization_id is null or p_interpretation_id is null
     or p_event_id is null or p_source_signal_id is null
     or p_engine_code is null or length(btrim(p_engine_code)) = 0
     or p_engine_version is null or length(btrim(p_engine_version)) = 0
     or p_interpretation_status is null
     or p_interpretation_status not in (
       'observed_only', 'supporting_evidence', 'discordant_evidence',
       'insufficient_evidence', 'requires_review'
     )
     or p_interpretation_payload is null
     or jsonb_typeof(p_interpretation_payload) <> 'object' then
    raise exception 'invalid_biological_interpretation_payload'
      using errcode = '23514';
  end if;

  select * into v_signal
    from public.biological_signals bs
   where bs.organization_id = p_organization_id
     and bs.signal_id = p_source_signal_id;
  if not found then
    raise exception 'biological_interpretation_source_signal_not_found'
      using errcode = 'P0002';
  end if;

  insert into public.biological_interpretations (
    organization_id, interpretation_id, domain, biological_subject_id,
    source_signal_id, source_analysis_id, source_finding_id,
    engine_code, engine_version, interpretation_status, interpretation_payload
  ) values (
    p_organization_id, p_interpretation_id, v_signal.domain,
    v_signal.biological_subject_id, v_signal.signal_id,
    v_signal.source_analysis_id, v_signal.source_finding_id,
    btrim(p_engine_code), btrim(p_engine_version),
    p_interpretation_status, p_interpretation_payload
  )
  on conflict (
    organization_id, source_signal_id, engine_code, engine_version
  ) do nothing;

  get diagnostics v_rows = row_count;
  v_inserted := v_rows > 0;

  select * into v_snapshot
    from public.biological_interpretations bi
   where bi.organization_id = p_organization_id
     and bi.source_signal_id = p_source_signal_id
     and bi.engine_code = btrim(p_engine_code)
     and bi.engine_version = btrim(p_engine_version);

  if v_snapshot.interpretation_id is null
     or v_snapshot.source_signal_id <> p_source_signal_id
     or v_snapshot.engine_code <> btrim(p_engine_code)
     or v_snapshot.engine_version <> btrim(p_engine_version)
     or v_snapshot.interpretation_status <> p_interpretation_status
     or v_snapshot.interpretation_payload <> p_interpretation_payload then
    raise exception 'biological_interpretation_id_conflict'
      using errcode = '23505';
  end if;

  if v_inserted then
    insert into public.biological_interpretation_events (
      organization_id, interpretation_id, event_id, event_type,
      actor_kind, actor_id, event_payload
    ) values (
      p_organization_id, p_interpretation_id, p_event_id, 'recorded',
      'system', null, jsonb_build_object(
        'engine_code', btrim(p_engine_code),
        'engine_version', btrim(p_engine_version),
        'interpretation_status', p_interpretation_status
      )
    );
  end if;

  return jsonb_build_object(
    'interpretation_id', v_snapshot.interpretation_id,
    'source_signal_id', v_snapshot.source_signal_id,
    'source_analysis_id', v_snapshot.source_analysis_id,
    'source_finding_id', v_snapshot.source_finding_id,
    'interpretation_status', v_snapshot.interpretation_status,
    'recorded_at', v_snapshot.recorded_at
  );
end;
$$;

revoke all on function public.record_biological_interpretation(
  uuid, uuid, uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_biological_interpretation(
  uuid, uuid, uuid, uuid, text, text, text, jsonb
) to service_role;

comment on table public.biological_interpretations is
  'Immutable versioned snapshots of biological interpretation, linked to the exact persisted signal, analysis and finding.';
comment on table public.biological_interpretation_events is
  'Append-only lifecycle history for biological interpretation snapshots.';
