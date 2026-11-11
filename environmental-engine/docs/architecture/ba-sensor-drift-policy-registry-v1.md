# Persisted sensor drift reference policies — v1

## Purpose

Persist the explicit target/reference pairing and scientific thresholds required by
`quality.sensor_drift`. The registry is intentionally separate from sensor
measurements and from the environment's sensor membership profile.

A drift result remains a *screening assessment* (`suspected` / `normal` /
`insufficient_data` / `not_evaluable`), never a confirmed calibration failure.

## Data model

Migration: `20261111090000_add_sensor_drift_reference_policies.sql`

Table: `public.sensor_drift_reference_policies`

Each row binds:

- one organization and one physical environment;
- one target IoT device and one distinct reference IoT device;
- one canonical variable;
- an inclusive calendar validity interval;
- explicit maximum timestamp-pair offset, minimum pair count, minimum
  observation duration, and maximum absolute differential drift rate;
- an explicit reference verification record and a version lifecycle.

Composite foreign keys bind **both** devices to the same organization and
environment. The environment itself is tenant-bound. The variable references
the canonical variable catalogue. Client-supplied device IDs are not sufficient
to bypass these constraints.

## Reference verification

A policy starts as `draft` and `reference_binding_verified = false`.

After creating the draft, an authenticated organization writer must explicitly set verification to true and provide:

- `reference_verification_method`: `co_located`,
  `calibration_certificate`, `manufacturer_reference`, or `other`;
- `reference_verification_evidence`: a concise evidence locator or note.

The database rejects verification on initial insert and stamps `reference_verified_at` and
`reference_verified_by` only on the subsequent authenticated false-to-true transition. Service-role calls without an authenticated user cannot perform this verification. Verification metadata
is immutable once recorded and cannot be revoked in-place. If the verification
was incorrect, create a replacement policy version and retain the earlier
record for auditability.

The evidence field is not a document store. Store a controlled document
reference or a short note, not certificate contents or sensitive attachments.

## Lifecycle and authorization

- Organization members may read policies through RLS.
- Organization writers may create and modify drafts.
- A policy must have a verified reference before it can be activated.
- Published versions use the shared `draft -> active -> retired` immutable
  lifecycle guard already used by environmental context profiles.
- Retiring a version closes its validity interval through the shared guard.
- At most one active policy may exist per organization, environment, target
  sensor, and variable.
- Overlapping published validity intervals for the same target/variable are
  rejected.
- Anonymous table access is revoked. Server-side policy resolution is available
  to `service_role`.

## Runtime resolution and assessment

The authenticated `sensor-analysis` gateway resolves policies after JWT,
environment membership, and sensor-profile authorization. Resolution is scoped
by organization, environment, active status, verified reference binding, and
the requested date interval. The target and reference devices must both belong
to the resolved sensor profile. The gateway forwards only database-resolved
policy fields; no client-supplied threshold or reference binding is trusted.

The private Python API validates policy structure and invokes
`quality.sensor_drift.assess_sensor_drift` against the normalized measurement
envelopes. Results are returned separately under
`instrument_health.drift_diagnostics`, preserving pair counts, robust
differential slope, assessment status, reason, and source observation IDs.
CultureOps displays this result as a separate instrumental diagnostic.

No policy means `not_requested`; it does not mean that the sensors are
normal. A policy that is present but cannot be evaluated remains explicitly
`not_evaluable` or `insufficient_data`. The UI counts only `suspected`
assessments as drift alerts and labels them as requiring metrological review.

## Deliberate boundaries

The registry, authenticated gateway resolution, private API assessment, and
read-only CultureOps diagnostics are integrated. A dedicated CultureOps
management interface for creating and retiring policies is not yet exposed;
until it exists, authorized writers must manage the lifecycle through a
controlled administrative workflow.

The verification lifecycle is intentionally multi-step:

1. Create a `draft` with `reference_binding_verified = false`.
2. In a separate authenticated update, record the verification method and
evidence and transition the flag to true. The database stamps the verifier
and timestamp, and requires the row to remain a draft during this step.
3. In a later update, activate the verified draft.
4. Retire an active version rather than editing its published contents.

Once verified, the organization, environment, target sensor, reference sensor,
and variable binding are immutable. A different physical pairing requires a
new draft and a new verification record. Thresholds and validity may still be
refined while the row remains a draft; activation freezes the published
version.

The system does not choose a reference sensor automatically, infer
co-location, convert units, interpolate observations, apply calibration
corrections, or write back modified measurements. The client must never submit
trusted policy thresholds or a reference-verification flag directly to the
analysis engine.

## Validation

The migration replay CI job runs
`supabase/tests/sensor_drift_reference_policies_contract.test.sql`, which
checks RLS, tenant/environment composite foreign keys, verification and
lifecycle triggers, active-policy uniqueness, grants, and policy definitions.
A successful GitHub Actions run is still required before treating the migration
as validated against PostgreSQL.
