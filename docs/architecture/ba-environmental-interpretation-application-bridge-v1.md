# Environmental interpretation application bridge v1

## Status

Design boundary only. This document does not claim that persisted biological interpretation is wired into the deployed application.

The current request path is:

`CultureOps client -> Supabase Edge Function -> authenticated tenant/location checks -> environmental_observations read -> private FastAPI /v1/analyses/nasa-power -> BAL-JSON climate analysis`.

The Python package also contains a persisted biological-context repository and an interpretation orchestrator, but the HTTP boundary does not call them yet.

## Verified integration gap

The current Edge Function accepts `location_id`, `start_date`, and `end_date`. It does not accept a biological subject or domain. It therefore cannot resolve the applicable row from `biological_contexts`.

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

Consequently, the Edge Function must not manufacture an EnvironmentContext or DomainProfile from guessed values, and it must not accept arbitrary client-supplied rules as trusted policy.

## Target request contract

The client should continue to identify the analysis scope and the biological subject; it should not submit trusted scientific rules.

Proposed client fields:

- `location_id`
- `start_date`
- `end_date`
- `domain` (`mycology`, `greentech`, or `lab`)
- `subject_id`

The Edge Function must:

1. Validate the caller JWT and organization membership.
2. Resolve the location under caller RLS and verify the requested subject belongs to the same organization and requested domain.
3. Load the unique biological context whose validity interval covers the complete analysis window. Zero matches means no biological interpretation; multiple matches or partial coverage must fail closed for interpretation.
4. Resolve a versioned environment-context profile linked to the selected environment.
5. Resolve an approved, immutable domain-interpretation profile for the requested domain and version.
6. Load quality-screened environmental observations within the tenant/location/date scope.
7. Call the private engine with the climate-analysis input plus the resolved, server-loaded context and profile.
8. Return climate indicators/findings separately from domain interpretation signals, preserving their distinct epistemic status.

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

The private API should expose a typed interpretation envelope rather than untyped dictionaries. The envelope should include:

- the BAL-JSON climate analysis result;
- the resolved biological context;
- the resolved environment context;
- the resolved domain profile;
- the resulting domain interpretation.

The API must validate that all organization, location, domain, subject, and date references agree before evaluating rules. A mismatch is a 422 contract error. Missing or ambiguous persisted context must never silently fall back to an unbound interpretation.

Climate analysis remains useful when no biological context is available. In that case, return the climate result and an explicit `interpretation_status: "not_requested" | "context_unavailable"`; do not invent biological conclusions.

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

1. Agree and migrate the two versioned registries.
2. Add read-only server-side resolvers to the Edge Function.
3. Extend the private FastAPI request/response contracts.
4. Add end-to-end tests with mocked Supabase and engine boundaries.
5. Validate SQL/RLS against a real Supabase test database.
6. Run Python, Deno, SQL migration replay, and repository CI on the exact PR head.
7. Only then enable the UI to request biological interpretation.

No deployment, production data mutation, merge, or automatic profile seeding is part of this design step.
