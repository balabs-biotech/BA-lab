# Sensor Engine — causal temporal screening v1

## Purpose

Add a statistical screening layer for high-frequency IoT observations. This
layer identifies deviations from a sensor's own recent history. It is not a
biological diagnosis, operating threshold, or recommendation engine.

## Contract

`assess_sensor_temporal_anomalies` accepts normalized
`SensorMeasurementEnvelope` records and requires three explicit parameters:

- `window_seconds`: elapsed-time history window;
- `minimum_history`: minimum number of earlier usable readings;
- `threshold`: absolute robust z-score threshold.

For a reading at time `t`, the baseline is the half-open interval
`[t - window_seconds, t)`. The current reading and all future readings are
excluded from its baseline.

## Statistical method

The baseline center is the median and dispersion is the median absolute
deviation (MAD). The modified robust z-score is:

`0.6744897501960817 * (value - median) / MAD`

When MAD is zero, the assessment is `indeterminate`; no artificial epsilon or
fallback dispersion is inserted. When history is below the explicit minimum,
the result is `insufficient_history`. Otherwise, the result is `suspect` only
when the absolute robust z-score exceeds the supplied threshold.

## Data integrity

- Streams are isolated by sensor UUID and variable code.
- Mixed canonical units in one stream are rejected.
- Duplicate sensor/variable/timestamp observations are rejected.
- Rows with `quality_state = excluded` are neither assessed nor included in
  subsequent baselines.
- Excluded rows remain in the upstream SensorAnalysis quality and lineage
  summary.
- No sampling cadence, missing reading, imputation, or biological threshold is
  inferred.
- The original measurement and source observation identity are preserved.

## Integration boundary

This module is deliberately separate from the existing daily NASA POWER
calendar-window screen. It does not use FAO-56. The next layer can convert
these source-linked assessments into domain signals only after a persisted
biological context and a versioned domain profile have been resolved.

## API exposure

The private endpoint `POST /v1/analyses/sensors` can optionally execute this
screen when all three explicit settings are supplied:

- `temporal_window_seconds`
- `temporal_minimum_history`
- `temporal_threshold`

Partial configuration is rejected. The response exposes a separate
`temporal_screening` object; descriptive series statistics remain unchanged.
Assessments are returned only for the requested local-calendar analysis
window. Earlier readings inside the same versioned profile's validity period
are available as causal baseline history, while readings outside that profile
validity window are excluded before normalization.

The Supabase gateway bounds the history window to 30 days, fetches enough
historical rows for the requested window, and still applies the 5,000-row cap.
