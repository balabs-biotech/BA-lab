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
