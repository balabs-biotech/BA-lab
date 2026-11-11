# BA Labs — Sensor drift assessment contract v1

## Purpose

Define a conservative diagnostic for progressive instrument drift without
confusing real environmental change with sensor malfunction.

This diagnostic is distinct from:
- measurement quality screening;
- transmission availability;
- exact-value flatline detection;
- biological interpretation.

## Scientific boundary

A monotonic trend in one sensor's readings is not, by itself, evidence of
instrument drift. Temperature, humidity, pH, dissolved oxygen and other
measurands can genuinely change over time. A time-series slope alone cannot
identify whether the cause is environmental or instrumental.

Therefore v1 MUST NOT label a single-sensor trend as instrument drift.

A drift assessment requires an explicit independent reference:
1. a designated reference sensor measuring the same variable;
2. an explicit, verified pairing/configuration proving the sensors are
   comparable (co-located or validated as a reference pair), with matching
   organization, environment context and location in the measurement lineage;
3. readings expressed in the same canonical unit;
4. a configured maximum time offset for pairing observations;
5. an explicit variable-specific maximum differential drift rate;
6. explicit minimum pair count and minimum assessment duration.

If any of these are absent, the result is `not_evaluable`, not a guessed
diagnosis.

## Measurement pairing

- Pair only target/reference readings for the same variable code.
- Pair within the configured maximum timestamp offset.
- Do not interpolate, extrapolate, or synthesize missing readings.
- A source reading may be used at most once in a pairing window.
- Resolve competing candidates deterministically by minimum absolute time
  difference, then timestamp, then source observation UUID.
- Excluded measurements never participate.
- Preserve target and reference observation IDs for every pair.
- Reject or mark non-evaluable incompatible units or invalid reference binding.

For each pair, calculate:

`difference = target_value - reference_value`

The sign is retained. The diagnostic assesses the trend of this differential,
not the raw environmental signal.

## Progressive differential trend

Use a robust Theil–Sen slope over paired differential values against elapsed
time. The slope is expressed in canonical units per hour.

To bound CPU and memory:
- sort pairs by timestamp;
- reject input above 5,000 measurement envelopes rather than silently truncating;
- cap the Theil–Sen slope sample at 200 evenly distributed pairs;
- if subsampling is needed, use deterministic, evenly spaced indices;
- never silently truncate the newest or oldest evidence;
- return an explicit `insufficient_data` or `not_evaluable` status when
  resource limits prevent a valid assessment.

A result is `suspected` only when:
- the minimum pair count is met;
- the minimum duration is met;
- the robust slope is finite;
- its absolute value exceeds the explicitly configured variable-specific
  maximum differential drift rate.

This is a candidate for calibration review, not proof of sensor failure.

## Statuses

- `suspected`: differential trend exceeds the explicit drift-rate policy.
- `normal`: sufficient reference-paired evidence is within policy.
- `insufficient_data`: reference pairing exists but count/duration is too low.
- `not_evaluable`: no valid reference binding, policy, compatible units, or
  bounded evidence set is available.

## Separation of diagnostic layers

- Transmission diagnostics consume `iot_ingest_receipts`.
- Measurement-quality and flatline diagnostics consume normalized measurement
  envelopes.
- Drift assessment consumes explicitly paired target/reference measurement
  envelopes.
- Biological interpretation may consume diagnostic outputs as evidence, but
  must not convert a suspected drift into a biological event or a confirmed
  instrument failure.

## v1 exclusions

- No automatic reference-sensor selection.
- No single-sensor slope-based drift claims.
- No implicit thresholds by variable or device type.
- No calibration correction or rewriting of stored measurements.
- No automatic exclusion of measurements after a suspected drift.
- No AI-generated thresholds.

## Implementation sequence

1. Add a pure provider-neutral pairing and differential-slope module. (Implemented in `quality/sensor_drift.py`.)
2. Add unit tests for matching, tie-breaking, excluded rows, units, thresholds,
   missing references, verified context binding, and resource caps. (Initial tests added; Python execution remains pending.)
3. Add a private API contract with explicit reference binding and policy.
4. Add authenticated tenant-scoped reference resolution in the Supabase
   gateway only after the database representation of reference pairings is
   established.
5. Add UI controls only when users can configure and audit the reference pair.
