# Sensor-to-biological interpretation bridge v1

The Sensor Engine and the biological interpretation layer remain separate.

## What the bridge does

The bridge accepts a completed `SensorAnalysis` and applies an explicitly
versioned `DomainProfile`:

- `normal` when the series is usable and has complete declared coverage;
- `insufficient_coverage` when declared sampling coverage is incomplete;
- `insufficient_history` when the series has no usable observations.

Rules still require an exact variable code, finding status and optional
biological context tags.

## What the bridge does not do

It does **not** infer a safe temperature, humidity, CO₂ concentration or any
species/strain threshold from source data. It therefore cannot silently turn a
descriptive mean into a biological diagnosis.

Threshold/event detection is a future, separately versioned layer. Its inputs
must be explicit, traceable and linked to a biological profile version.

## Consequence for CultureOps

A Pleurotus fruiting room, a GreenTech greenhouse and a laboratory incubator
can all use the same sensor pipeline. Their meaning diverges only when the
versioned biological/domain profile is applied.

## Authenticated execution path

The private Sensor API now accepts an optional `biological_interpretation`
payload. It validates the biological context, sensor-origin environment
profile, domain profile, tenant/location/environment bindings, validity dates,
and membership of analyzed sensor IDs in the resolved profile before
generating signals. Invalid interpretation context does not discard the
underlying descriptive sensor analysis; the response reports
`interpretation_status = context_invalid`.

The Supabase `sensor-analysis` gateway accepts an optional `subject_id`.
When present, it resolves exactly one persisted `biological_contexts` row for
the requested tenant, physical environment, subject and complete date range,
then resolves exactly one active/retired `domain_interpretation_profiles`
version covering that range. The browser cannot submit rule definitions or
choose a profile version. The gateway builds the typed payload from persisted
records and forwards it over the private server-to-server channel.

Without `subject_id`, the route remains a descriptive Sensor Engine request
and returns `interpretation_status = not_requested`.
