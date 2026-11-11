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

The bridge validates the actual half-open sensor-analysis interval
(`[from_at, to_at_exclusive)`) against the requested biological date scope in
the resolved environment timezone. It converts the first instant and the
final included instant to local calendar dates before accepting interpretation.
This prevents a valid-looking request envelope from authorizing measurements
that extend beyond the biological context's declared validity window.

The check is deliberately applied to the interpretation layer, not to the
descriptive sensor analysis. If the biological context is invalid, the API
retains the descriptive sensor result and returns
`interpretation_status = context_invalid` with no domain signals. The API
contract test covers a biological context whose validity starts after the
requested sensor-analysis day.

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

Profile versions are stored as text (maximum 32 characters), matching the
engine contract and its semantic-version values such as `1.2.0`. An initial
integer-only database constraint conflicted with the Python models and
persistence fixtures; migration
`20261111000400_align_profile_versions_with_engine_contract.sql` converts
both profile registries to text. The live schema was queried after migration
and both columns now report PostgreSQL `text`.

### Resolver-scope interval integrity

The Python and Edge resolvers require exactly one profile for a requested
scope. Their lookup scope is the tenant plus environment for environment
profiles, and the tenant plus biological domain for domain profiles; it is
not partitioned by `profile_code`. Therefore, two different profile codes
must not have overlapping activated validity intervals in the same resolver
scope.

Migration `20261111042419_enforce_profile_resolution_windows.sql` adds
database triggers for both registries. On activation or insertion of an
active/retired row, each trigger:

- serializes writes for the same tenant/scope with a transaction advisory lock;
- rejects any inclusive date-range overlap with another active/retired profile,
  including a shared boundary date;
- allows sequential historical versions whose intervals do not overlap;
- checks all profile codes together, matching the resolver's actual query
  semantics.

The trigger functions are private `SECURITY DEFINER` functions with a fixed
search path and no direct EXECUTE grant to API roles. This is required so the
integrity check sees all rows in the tenant scope even when RLS is active; the
caller still needs the existing writer policy to modify the row.

A profile with an open-ended validity period must be closable when its
replacement is activated. Migration
`20261111042631_allow_profile_validity_closure_on_retirement.sql` therefore
allows exactly one lifecycle exception: an `active` profile may become
`retired` while setting a finite `valid_to` date. The date may only shorten an
existing finite window; scientific/configuration fields remain immutable, a
retired profile cannot be reactivated, and the normal overlap trigger validates
the shortened interval before the update is accepted.

The live regression probe first demonstrated the defect: two active
environment profiles with different codes and overlapping dates were accepted
(the transaction was rolled back). After migration, transactional probes
confirmed that an inclusive boundary overlap is rejected for environment
profiles, an overlapping domain profile is rejected, and a sequential
non-overlapping environment profile is accepted. All probe rows were rolled
back. Additional transactional probes confirmed that an open-ended active profile
can be retired with a finite end date, its scientific fields cannot be changed
during retirement, and a non-overlapping successor can then be activated. All
probe rows were rolled back. These checks validate the database trigger
behavior; they do not replace the Python test suite or a full authenticated API
end-to-end request.

## Verification status

The four registry tables, RLS policies, composite tenant constraints, trigger
definitions and grants have been inspected in the live schema. The SQL
interval regression probes passed after migration. Python integration tests
and a full authenticated end-to-end request still need to be run before this
bridge can be considered fully verified.
