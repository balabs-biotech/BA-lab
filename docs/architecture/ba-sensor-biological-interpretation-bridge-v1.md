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


## Temporal integrity hardening

The bridge validates the actual half-open sensor-analysis interval (`[from_at, to_at_exclusive)`) against the requested biological date scope in the resolved environment timezone. It converts the first instant and the final included instant to local calendar dates before accepting interpretation. This prevents a valid-looking request envelope from authorizing measurements that extend beyond the biological context's declared validity window.

The check is deliberately applied to the interpretation layer, not to the descriptive sensor analysis. If the biological context is invalid, the API retains the descriptive sensor result and returns `interpretation_status = context_invalid` with no domain signals. The API contract test covers a biological context whose validity starts after the requested sensor-analysis day.


## Persisted registry implementation

The CultureOps Supabase project now contains the persistence layer expected by
the Python adapters:

- `biological_contexts`: tenant-scoped biological subject context, with
  exactly one culture or plant-culture reference and an environment reference;
- `environment_context_profiles`: versioned environment configuration;
- `environment_context_profile_sensors`: sensor membership for an environment
  profile;
- `domain_interpretation_profiles`: versioned JSON rule sets for mycology,
  GreenTech and Lab.

All four tables have RLS enabled. Reads are limited to organization members;
writes are limited to organization writers through the existing
`private.is_org_member` and `private.is_org_writer` authorization helpers.
Composite foreign keys preserve tenant consistency across biological subjects,
environments, sensor devices and profile bindings.

Environment and domain profile content becomes immutable after activation.
Activated versions cannot be deleted; sensor bindings can only be changed while
their parent profile remains a draft. Authenticated table grants are restricted
to SELECT/INSERT/UPDATE/DELETE; row authorization remains the responsibility
of RLS.

The migrations are:

- `20261111000100_create_biological_profile_registries.sql`
- `20261111000200_harden_profile_registry_immutability.sql`
- `20261111000300_restrict_registry_table_grants.sql`

The live schema and policies were queried after deployment. Security Advisor
findings currently reported for `iot_devices`, `iot_ingest_receipts`,
existing SECURITY DEFINER RPCs and leaked-password protection predate this
registry work; none names the four new registry tables. Python integration
tests and a full authenticated end-to-end request still need to be run before
this bridge can be considered fully verified.

Profile versions are stored as text (maximum 32 characters), matching the
engine contract and its semantic-version values such as `1.2.0`. An initial
integer-only database constraint conflicted with the Python models and existing
persistence fixtures; migration `20261111000400_align_profile_versions_with_engine_contract.sql`
converts both profile registries to text. The live schema was queried after
migration and both columns now report PostgreSQL `text`.
