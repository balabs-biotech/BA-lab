-- Preserve the method and statistical evidence behind each biological signal.
-- In particular, IoT temporal deviations must remain distinguishable from daily
-- gridded-climate findings and retain the exact screening parameters used.

alter table public.biological_signals
  add column analysis_method text not null default 'environmental_daily'
    check (analysis_method in (
      'environmental_daily', 'sensor_series', 'sensor_temporal'
    )),
  add column analysis_evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(analysis_evidence) = 'object');

comment on column public.biological_signals.analysis_method is
  'Identifies the analysis path that produced the signal: daily external climate, IoT series summary, or causal robust IoT temporal screening.';
comment on column public.biological_signals.analysis_evidence is
  'Machine-readable, source-linked evidence including robust baseline statistics and explicit temporal screening parameters where applicable.';

-- The evidence relation supports both NASA POWER environmental observations
-- and in-situ IoT measurements. Route by the now-persisted analysis method.
create or replace function private.link_biological_signal_evidence()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_evidence_id uuid;
begin
  if new.analysis_method = 'environmental_daily' then
    for v_evidence_id in
      select value::uuid
        from jsonb_array_elements_text(new.source_observation_ids) as item(value)
    loop
      insert into public.biological_signal_evidence (
        organization_id, signal_id, source_kind, evidence_id,
        environmental_observation_id, measurement_id
      )
      values (
        new.organization_id, new.signal_id, 'environmental_observation',
        v_evidence_id, v_evidence_id, null
      )
      on conflict (organization_id, signal_id, source_kind, evidence_id) do nothing;
    end loop;
  elsif new.analysis_method in ('sensor_series', 'sensor_temporal') then
    for v_evidence_id in
      select value::uuid
        from jsonb_array_elements_text(new.source_observation_ids) as item(value)
    loop
      insert into public.biological_signal_evidence (
        organization_id, signal_id, source_kind, evidence_id,
        environmental_observation_id, measurement_id
      )
      values (
        new.organization_id, new.signal_id, 'measurement',
        v_evidence_id, null, v_evidence_id
      )
      on conflict (organization_id, signal_id, source_kind, evidence_id) do nothing;
    end loop;
  else
    raise exception 'unsupported_biological_signal_analysis_method'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.link_biological_signal_evidence()
  from public, anon, authenticated;

create trigger biological_signals_link_evidence
  after insert on public.biological_signals
  for each row execute function private.link_biological_signal_evidence();
