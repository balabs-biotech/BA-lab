# Sensor domain-signal evidence contract v1

## Purpose

A domain signal derived from an IoT series must carry enough descriptive evidence to explain the classification without reopening the full measurement query. The signal is still a profile-routed interpretation, not a biological diagnosis.

## Evidence payload

For each routed sensor-series summary, `DomainSignal.evidence` contains:

- `assessment_type`: fixed value `sensor_series_summary`;
- `sensor_id` and the half-open analysis window (`window_from`, `window_to_exclusive`);
- total, usable and excluded observation counts;
- quality-state counts;
- minimum, maximum, mean, median and population standard deviation of usable readings;
- expected count, availability ratio, gap count and maximum gap when a nominal sampling interval was explicitly configured.

The signal's `source_observation_ids` remain the exact source-row lineage. Excluded observations remain in that lineage and in quality counts, but do not contribute to descriptive statistics.

## Missingness and interpretation limits

- Coverage fields remain `null` when no expected sampling cadence was declared. The engine does not infer a cadence from observed timestamps.
- A missing mean remains null; it is never serialized as zero.
- A series signal is emitted only when a versioned domain profile explicitly matches its variable, computed finding status and required context tags.
- The evidence payload describes the analyzed series. It does not assert that an environmental condition caused a biological outcome.
- No raw observation series is duplicated into the signal record; source IDs preserve the link to the canonical measurements.

## Compatibility

This is an additive JSON payload under the existing `biological_signals.analysis_evidence` field. It does not require a database migration or change the BAL signal identity, rule matching, severity, or recommendation semantics.
