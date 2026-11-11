# BA Labs Biological BAL Envelope v1

## Purpose

The biological performance engine produces subject-scoped calculations. These
results are not environmental observations and must not be forced into the
existing location-scoped environmental BAL analysis envelope.

This contract therefore defines a separate, versioned biological envelope.
Both envelopes share BAL conventions (explicit contract version, engine
identity, typed payload, provenance and deterministic serialization), but
retain distinct scopes and schemas.

## Scope

A biological analysis is bound to:

- one organization;
- one biological subject: culture, plant culture, sample or experimental unit;
- one calculated metric;
- one versioned formula;
- one measurement period, when available;
- the exact accepted and excluded source measurement record IDs.

The serializer is pure. It does not query Supabase, convert units, change
quality policy, infer missing measurements or make biological diagnoses.

## Evidence semantics

- `calculated`: requires a numeric value, unit, period and at least two
  accepted observations.
- `insufficient_evidence`: requires a null value and an explicit reason.
- Accepted and excluded record IDs must be unique and disjoint.
- Their declared counts must exactly match their ID arrays.
- Formula code and version are carried from the calculation result unchanged.
- All generated and period timestamps must be timezone-aware.

## Boundary with CultureOps

The trusted application gateway remains responsible for user authentication,
organization authorization and subject access. The Python engine's tenant and
subject filters are defense in depth, not an authorization boundary.

CultureOps can store or transport this envelope independently from
environmental analysis. A future composition layer may reference both
envelopes from one experiment or culture timeline, but must not merge their
scopes or treat environmental estimates as biological measurements.

## Current implementation

- Contract: `contracts/biological_analysis.py`
- Serializer: `serialization/biological_performance.py`
- Calculation input: `indicators/biological_performance.py`
- Pipeline: `indicators/biological_pipeline.py`
- Contract tests: `tests/test_biological_serialization.py`
