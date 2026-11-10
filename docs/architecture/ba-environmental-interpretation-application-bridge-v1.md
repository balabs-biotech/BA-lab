# Environmental interpretation application bridge v1

## Status

Partial implementation on the feature branch; not deployed. The Edge Function and private FastAPI boundary support optional, server-resolved biological interpretation. The GreenTech client now exposes an optional active plant-culture selector and sends `domain: "greentech"` plus `subject_id` when a subject is selected. The default remains climate-only.

Current request path:

`CultureOps client -> Supabase Edge Function -> JWT / tenant / location checks -> optional biological-context + profile resolution -> environmental_observations read -> private FastAPI /v1/analyses/nasa-power -> BAL-JSON climate analysis + optional domain interpretation`.

Climate analysis remains independent. If the client does not send both `domain` and `subject_id`, the gateway returns `interpretation_status: "not_requested"`.

## Remaining client integration gap

The Edge Function accepts optional `domain` and `subject_id` fields together with `location_id`, `start_date`, and `end_date`. The GreenTech client loads active plant cultures associated with the selected location (directly or through an environment) under caller RLS. When one is selected, it sends the subject identifier and GreenTech domain; otherwise it requests climate-only analysis. Mycology and Lab client selectors remain to be integrated.

The current `EnvironmentContext` model requires:

- context/environment UUID;
- organization and physical location UUIDs;
- context type and label;
- IANA timezone;
- observation origin;
- sensor IDs when origin is `sensor`;
- environment profile code and version.

The existing `environments` table has `location_id`, `name`, and generic `metadata`. The current `biological_contexts` migration does not define a typed, versioned source for all required environment-context fields.

The interpretation engine requires an explicit `DomainProfile` with a module, profile ID, version, and rules. No authoritative persisted profile registry or approved domain rule set was found in the inspected application boundary. The engine deliberately contains no default biological thresholds or recommendations.

Consequently, the Edge Function loads the environment and domain profiles from the versioned registries. It does not manufacture either profile and does not accept arbitrary client-supplied rules as trusted policy.

## Request contract implemented on the feature branch

The client identifies the analysis scope and, optionally, the biological subject; it never submits trusted scientific rules.

Accepted client fields:

- `location_id`
- `start_date`
- `end_date`
- `domain` (`mycology`, `greentech`, or `lab`)
- `subject_id`

The Edge Function must:

1. Validate the caller JWT and organization membership.
2. Resolve the location under caller RLS and verify the requested subject belongs to the same organization and requested domain.
3. Load the unique biological context whose validity interval covers the complete analysis window. Zero matches, multiple matches, or partial coverage prevent interpretation only.
4. Resolve a versioned environment-context profile linked to the selected environment.
5. Resolve a versioned domain-interpretation profile for the requested domain and complete date window.
6. Load environmental observations within the tenant/location/date scope.
7. Call the private engine with climate input plus the server-resolved context and profile.
8. Return climate indicators/findings unchanged, with `domain_interpretation` and `interpretation_status` as sibling fields.

The service-role client may only be used after caller authentication and authorization. All service-role queries must include explicit organization and resource filters. RLS remains enabled for user-facing access.

## Implemented persistence contract on the feature branch

The feature branch now defines two tenant-scoped registries and one normalized sensor-binding table:

- `environment_context_profiles`: one active profile per environment, with context type, label, IANA timezone, observation origin, version, and effective date interval.
- `environment_context_profile_sensors`: normalized sensor membership, protected by composite foreign keys to both the environment profile and the exact tenant/environment/device tuple. This avoids storing unvalidated sensor UUID arrays.
- `domain_interpretation_profiles`: one active interpretation profile per organization and domain, with a versioned JSON rules array matching the Python `InterpretationRule` contract.

Lifecycle is `draft -> active -> retired`. Drafts can be edited or deleted. Activation stamps the version; active content cannot be edited or deleted. Retirement closes the effective interval and preserves the original content. Overlapping published validity intervals are rejected. No default domain rules or biological thresholds are seeded.

The SQL contract test covers RLS, anonymous-role denial, tenant/environment sensor binding, activation requirements, immutable published content, retirement, active-profile uniqueness, and JSON rule shape. It is wired into the migration-replay CI job.

This is repository work only. The migration has not been applied to the live BALabs Supabase project, and the SQL contract test has not yet been executed on a PostgreSQL runner.

## Python profile resolver

The engine now has a read-only `SupabaseEnvironmentalProfileRepository` adapter. It resolves only active or retired versions whose effective interval covers the complete analysis window. It joins the physical environment location and normalized sensor bindings, then validates them through the existing Pydantic `EnvironmentContext` contract.

The `domain_profile_from_record` mapper validates each persisted JSON rule against `InterpretationRule`; the resulting `DomainProfile` is therefore typed before evaluation.

The `interpret_persisted_analysis_with_profiles` orchestration function now resolves, in order:

1. the biological context for the requested tenant, domain, subject, and complete analysis period;
2. the environment profile referenced by that biological context;
3. the active or historical domain rule profile for that context's domain;
4. the interpretation after tenant, location, environment, domain, and validity checks.

The application supplies only the requested domain and subject identifier. It does not select a profile version or submit rules. The domain profile is selected from the persisted biological context after the context has been resolved.

The adapter is database-client agnostic and receives an already-authenticated Supabase client. It does not import the Supabase SDK, read credentials, or perform authentication. Unit tests cover its row mapping, tenant/date filters, missing and ambiguous profile handling, and the end-to-end interpretation resolver; these tests have been added but have not yet been executed.

## Required persistence before end-to-end interpretation

Before enabling the target contract, define and migrate:

- a verified deployment and SQL replay of the environment-context profile registry;
- approved domain-profile content for Mycology, GreenTech, and Lab, entered and reviewed by BA Labs rather than seeded as assumed scientific defaults;
- tenant-scoped foreign keys and RLS policies;
- uniqueness rules preventing two active profile versions for the same scope;
- audit/provenance fields recording which environment profile and domain profile version produced each interpretation.

Do not put domain thresholds directly in the Edge Function. Do not make the Python scientific engine responsible for JWT validation or Supabase credentials.

## Engine API changes

The private API now accepts an optional `biological_interpretation` object on `/v1/analyses/nasa-power`. The object contains three server-resolved records: `biological_context`, `environment_context`, and `domain_profile`. FastAPI validates each against its Pydantic domain model and checks tenant, location, environment, domain, and temporal bindings before evaluation.

The response preserves the existing BAL-JSON keys (`indicators`, `findings`, `source_summary`, and `warnings`) and adds sibling fields:

- `interpretation_status`;
- `domain_interpretation` (null when no valid interpretation is produced).

Invalid context payloads produce `context_invalid` while preserving the climate analysis. The Edge Function handles missing or ambiguous persisted rows before calling the engine and supplies explicit statuses including `context_unavailable`, `ambiguous_context`, `context_does_not_cover_scope`, `environment_profile_unavailable`, `ambiguous_environment_profile`, `domain_profile_unavailable`, and `ambiguous_domain_profile`. No client-selected profile version or rule set is accepted.

## Required integration tests

- caller without location access cannot trigger service-role observation reads;
- subject from another organization is rejected;
- subject/domain mismatch is rejected;
- no biological context returns climate-only output with an explicit status;
- one context covering the complete analysis window is accepted;
- context covering only part of the window is rejected for interpretation;
- overlapping contexts are rejected as ambiguous;
- environment profile missing or inactive prevents interpretation, not climate calculation;
- domain profile missing or inactive prevents interpretation, not climate calculation;
- profile version and context IDs are preserved in every emitted signal;
- a malformed or cross-tenant payload cannot cross the private API boundary;
- no client-supplied rule can override the server-loaded profile.

## Implementation sequence

1. Versioned profile registries and normalized sensor bindings: implemented in migrations and SQL contract tests; not applied to live Supabase.
2. Edge Function resolvers for biological context, environment profile, and domain profile: implemented on the feature branch; Deno tests still required.
3. Private FastAPI request/response contract: implemented with optional Pydantic validation and climate-preserving failure behavior.
4. Python API tests: added for successful interpretation and invalid-context isolation; not executed.
5. Add Edge Function integration tests with mocked Supabase and engine boundaries.
6. GreenTech subject selector and optional request fields: implemented. Extend the same subject-selection contract to Mycology and Lab.
7. Validate SQL/RLS against a real Supabase test database and run Python, Deno, SQL migration replay, and repository CI on the exact PR head.

No deployment, production data mutation, merge, or automatic profile seeding is part of this design step.
