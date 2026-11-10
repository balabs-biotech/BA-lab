# Sensor Event Engine v1

## Purpose

The descriptive Sensor Engine reports measurements and statistics. The event
detector operates on ordered observation-level IoT envelopes to identify
sustained excursions against an explicitly configured, versioned rule profile.

## Versioned contracts

- `SensorEventProfile`: profile ID, domain module, version and unique rules.
- `SensorEventRule`: variable, canonical unit, comparator, threshold,
  minimum observation count, minimum duration, optional maximum inter-sample
  gap, accepted quality states, required biological context tags, severity and
  message/event codes.
- `SensorEvent`: event interval, measured extrema/mean, configured threshold,
  profile/rule versions and source observation IDs.
- `SensorEventAnalysis`: deterministic collection of events for a profile.

No threshold is shipped for Pleurotus, tomato, an incubator or any other
biological subject. Thresholds must be supplied by a reviewed domain profile.
The module provides mechanics, not agronomic or mycological recommendations.

## Detection semantics

1. Match exact variable code and canonical unit.
2. Match required biological context tags.
3. Accept only explicitly configured quality states; excluded observations
   are never used.
4. Sort each sensor/variable series by measurement timestamp.
5. Form consecutive runs that satisfy the configured comparator.
6. Split a run when a non-matching observation occurs or the configured maximum
   gap is exceeded.
7. Emit an event only when both minimum observation count and minimum duration
   are satisfied.
8. Preserve the exact IDs of every observation used in the event.

There is no interpolation, smoothing, resampling, hysteresis, imputation or
cross-source merging in v1. Duplicate timestamps within a sensor/variable
series are rejected rather than counted twice.

## Current integration boundary

The detector is a pure Python module accepting normalized
`SensorMeasurementEnvelope` objects. The application use case
`run_sensor_event_analysis` now loads a tenant/environment-scoped date range
through the existing read-only sensor repository, checks returned tenant and
environment identities, applies the profile timezone window, and invokes the
detector with an injected trusted profile.

It is not yet wired into the private FastAPI route or the Edge Function.
Profile persistence, approval workflow, effective-date resolution and durable
event storage remain separate integration tasks.

## Safety and operational requirements for the next phase

- Resolve one approved event profile version for the biological context and
  observation period.
- Never accept thresholds directly from an untrusted browser request.
- Keep raw observations immutable; persist event outputs separately with
  profile/rule version and lineage.
- Make event generation idempotent from stable event identity.
- Distinguish event onset, ongoing event, recovery and acknowledgement in a
  later lifecycle model; v1 only detects intervals in a supplied batch.
