# Sensor instrument-health diagnostics v1

## Purpose

Instrument-health diagnostics are a separate quality layer. They describe evidence
about the measurement channel and must not be relabelled as biological findings.
A suspected instrument issue does not, by itself, establish a culture anomaly or
justify a biological recommendation.

## Flatline candidate

The first detector identifies long runs of exactly repeated, consecutive values
for the same sensor and variable. The sensor adapter already resolves values into
the variable's canonical unit; the detector does not round, interpolate, smooth,
or compare values across sensors or variables.

A run is interrupted by:
- a different numeric value;
- an excluded measurement; or
- a change of sensor or variable (each group is assessed independently).

The detector is opt-in. Both policy values must be supplied:
- `flatline_minimum_repeated_observations`: integer from 2 through the request row cap;
- `flatline_minimum_duration_seconds`: positive integer, capped at 30 days.

A run is marked `suspected` only when it meets both the observation-count and
elapsed-duration requirements. Missing policy returns `not_requested` at the API
boundary; partial policy is rejected. Empty usable data is `insufficient_data`.
A configured series that does not meet the policy is `normal`, which means only
that this detector did not identify the configured pattern.

## Output contract

The private sensor analysis response exposes:

- `instrument_health.flatline_diagnostics.status`: `not_requested` or `completed`;
- `assessments[]`: one assessment per sensor/variable group;
- `status`: `suspected`, `normal`, `insufficient_data`, or `not_evaluable`;
- `observation_count`, `longest_repeated_run`, and
  `longest_repeated_duration_seconds`;
- `source_observation_ids` for source traceability.

The gateway forwards only validated, bounded policy values. The browser interface
requires both values together. No default count, duration, sensor resolution, or
biological threshold is assumed.

## Interpretation limits

Exact repeated readings can be caused by a genuinely stable environment, sensor
resolution, quantization, or a stuck acquisition path. Therefore `suspected` is
a review flag, not a fault classification. Calibration status, manufacturer
diagnostics, sensor heartbeat telemetry, and independent reference instruments
are not inferred by this detector.

Silence and irregular cadence remain distinct questions. Existing series gap
metrics describe observed cadence gaps when an expected interval is supplied;
they are not silently converted into flatline findings.
