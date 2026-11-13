# Biological Intelligence Engine — architecture contract v1

Status: architecture and implementation contract. The deterministic context-coverage slice is implemented on stacked feature branches; biological inference and production deployment are not claimed.

## 1. Purpose

The Biological Intelligence Engine (BIE) produces traceable, bounded interpretations from validated biological records and their experimental/environmental context. It is an analytical layer above BAL-Core and the versioned Python engine runtime.

BIE is not a diagnostic authority. It must distinguish:
- observed facts from derived features;
- statistical associations from causal explanations;
- hypotheses from validated conclusions;
- missing evidence from negative evidence.

The engine must never modify source cultures, measurements, observations, batches, events or genetic identities.

## 2. Architectural placement

`CultureOps UI → Supabase authenticated orchestration → immutable input snapshot → registered BIE engine → validated result envelope → engine_execution_results → interpretation UI`

Responsibilities remain separated:

- **CultureOps:** selects the biological subject and presents results; client-side checks are advisory.
- **Supabase:** authenticates the caller, checks organization membership and source-row access, creates the execution ledger entry and persists validated results.
- **BAL-Core:** validates record structure, provenance, units and traceability. It does not infer biology.
- **BIE Python engines:** compute versioned features, compare observations with explicit reference context, and emit bounded interpretations.
- **PostgreSQL:** retains immutable source records, execution metadata and analytical outputs under tenant isolation.

BIE must use the existing engine request/response contracts and execution ledger. It must not create a parallel job queue, result store or authorization model.

## 3. Initial scope

The first implementation is deliberately narrow: a **culture-condition context engine** for one culture or batch and a bounded observation window.

Eligible inputs, when available and authorized:
- culture identity and genetic reference identifiers;
- culture/batch lifecycle timestamps and recorded operations;
- measurements linked to the culture, sample or experimental unit;
- environmental observations linked to an explicit location and time window;
- experiment/treatment/replicate context;
- source quality state, method, instrument and provenance.

The engine must not assume that all these records exist. It must report the actual coverage of its input snapshot.

Out of scope for v1:
- automated strain selection;
- disease or contamination diagnosis;
- prescriptive treatment or intervention;
- causal claims from observational time series;
- unvalidated universal biological thresholds;
- image-based phenotype recognition;
- autonomous changes to culture parameters;
- Sentinel-2 raster/NDVI inference (handled by the separate spatial contract).

## 4. Input contract requirements

The orchestrator must resolve source rows using the caller-scoped Supabase client and existing RLS policies. The browser must send identifiers and parameters, not arbitrary scientific source payloads.

Every execution must include:
- organization and authorized biological scope;
- a source record list that may be empty only for `biological.context.features`, where an empty snapshot is a valid `insufficient_data` result and must still be persisted;
- engine ID and semantic version;
- stable request and idempotency identifiers;
- immutable input snapshot hash;
- source record IDs and record types;
- explicit analysis window and timezone policy;
- declared parameters and parameter-schema version.

Input eligibility:
- excluded or invalidated records are not silently included;
- incompatible variables or units are not combined;
- provider-derived gridded estimates remain distinguished from local sensor measurements;
- records from different locations or provider/dataset identities are not merged unless a future engine contract explicitly supports that operation;
- timestamps without an unambiguous interpretation are flagged and excluded from temporal calculations;
- missing values are not imputed in v1 unless a named, versioned method is explicitly enabled and reported.

## 5. Output contract

BIE returns the existing `BA-LABS/ENGINE-RESULT` envelope. Its structured result uses `result_type: biological.context_assessment` and `result_version: 1.0.0`.

Required result sections:

1. **Subject:** stable culture/batch/experimental-unit references; no copied mutable identity claims.
2. **Coverage:** requested window, observed window, expected/received record counts where meaningful, missing variables and temporal gaps.
3. **Observed facts:** source-backed values and events, with source record IDs and timestamps.
4. **Derived features:** exact formula/method, units, algorithm version and input references.
5. **Findings:** bounded statements supported by the supplied records.
6. **Hypotheses:** optional candidate explanations, explicitly labelled as unverified and linked to supporting and contradicting evidence.
7. **Limitations:** missing context, measurement uncertainty, spatial/temporal resolution, domain restrictions and known confounders.
8. **Quality flags:** machine-readable codes for incomplete, inconsistent, sparse, out-of-domain or review-required inputs.
9. **Provenance:** engine/version, parameters, input snapshot hash, source identities and generation timestamp.

A finding must be reproducible from its cited input records and declared method. A hypothesis must never be presented as an observed fact.

## 6. Confidence and evidence policy

- Do not emit a numeric confidence score unless the method has a documented calibration procedure and validation evidence for the relevant domain.
- Use categorical evidence states such as `supported`, `limited`, `conflicting`, and `insufficient_data` only where their definitions are versioned.
- Do not equate data volume with evidence strength.
- Correlation, temporal coincidence and model output do not establish causation.
- If input coverage is insufficient, return `insufficient_data` or `review_required`; do not manufacture a conclusion.
- Preserve both supporting and contradicting observations when they materially affect an interpretation.

## 7. Failure isolation and security

- BIE is optional to the core recording workflow. Its outage must not block manual data entry, culture history, batch traceability or existing result viewing.
- Execution is tenant-scoped and authorized through the existing orchestrator.
- Python workers receive only the minimum validated snapshot required for the selected engine.
- Worker URLs and tokens remain server-side secrets.
- Results are immutable; a changed input snapshot or engine version creates a new execution.
- UI rendering must treat result text as untrusted data and must not execute markup or instructions embedded in source observations.
- Safe error codes are persisted; raw worker exceptions and secrets are not exposed to clients.

## 8. First implementation sequence

1. **Contract and schema:** add JSON Schema for `biological.context_assessment.v1`; validate examples and rejection cases.
2. **Read-model audit:** identify the exact existing tables/relationships for culture, batch, experimental unit, measurement and environmental observation. Do not guess or duplicate schema.
3. **Snapshot builder:** extend the authenticated orchestrator through explicit source-type adapters and strict scope checks. Preserve immutable source hashes.
4. **Deterministic feature engine:** implement coverage, temporal alignment, gaps, summary statistics and quality flags only; no biological recommendation in this slice.
5. **Persistence:** store the versioned result through the existing service-only completion RPC and result table.
6. **UI:** present observed facts, derived features, limitations and provenance separately.
7. **Biological interpretation:** only after validation datasets and domain-specific reference methods are documented.

Implementation update (2026-11-12): the first deterministic Python feature engine, `biological.context.features@0.1.0`, and its registry manifest are present on the BIE feature branch. It accepts an already-authorized immutable snapshot for one culture and computes descriptive series statistics, temporal gaps, coverage, source-linked observations and quality flags. A separate pure TypeScript resolver now interprets `biological_contexts.valid_from/valid_to` in the requested timezone, checks each measurement against its explicit `measurements.environment_id`, and refuses overlapping contexts, mismatches, missing historical links, or an analysis window spanning multiple contexts. It deliberately ignores the culture's current `environment_id` as a historical fallback. The resolver is covered by a focused CI test. The resolver is now composed with the snapshot adapter in `supabase/functions/_shared/biological-context-assembly.ts`. The assembly uses the historically resolved environment rather than the mutable culture FK, attaches each measurement's resolution status, and admits external weather observations only when the full requested window maps to one unambiguous environment/location. Ambiguous, conflicting or missing context is preserved in the engine parameters/coverage instead of silently selecting an environment. The exclusive `valid_to` boundary and half-open analysis window are interpreted in the requested timezone. The pure assembly is covered by CI tests. A first authenticated loader now exists in `supabase/functions/_shared/biological-context-loader.ts`: it accepts only a caller-scoped Supabase client, reads the culture, dated contexts, measurements, environments and visible locations under that client's RLS, enforces row-count bounds, and only queries weather when the complete window has one resolved location. Its mock-client contract test is in CI. The loader is now invoked by the BIE branch in `engine-orchestrator` after caller authentication and organization membership checks. The branch derives all record IDs from the loader and ignores client-supplied record IDs. It reuses the existing request-schema validation, execution ledger, idempotency, worker correlation and atomic result persistence. Activation is guarded by the server-side `BA_BIE_ENABLED=true` feature flag; absent that flag, BIE remains unavailable. The default production state is therefore closed. The new orchestrator path is awaiting its CI contract verification; no production deployment or flag change has been made.

Biological metadata enrichment update (2026-11-12): the authenticated loader now selects the time-bounded context fields already present in `biological_contexts` (organism kind, taxon/strain/cultivar codes, stage, substrate, production system and tags). It resolves each non-empty `strain_code` only against `strains` in the same organization, then reads the linked shared organism taxonomy record. The assembly includes only contexts intersecting the requested local-date window, retains their validity bounds, and labels genetic references as `resolved`, `unresolved` or `not_specified`; it never guesses a genetic identity from a free-text taxon code. These descriptors are passed as versioned assessment data and included in the immutable input hash. The Python engine returns them under the assessment subject and exposes resolved strain IDs separately. Schema, loader, assembly and Python regression tests cover this path. The live project currently has 0 biological-context rows, 13 strain records and 12 organism records: the implementation is ready to consume populated contexts, but no current culture can yet receive a strain-specific interpretation until its context is recorded. No recommendations or strain rankings are introduced.

CultureOps integration update (2026-11-12): the Mycology and Laboratory culture-detail view now contains a biological-context editor backed by the existing `biological_contexts` table. It reuses the organization's environment and strain catalogues, maps the Laboratory workspace to the database domain `lab`, and records organism kind, taxon, strain, stage, substrate, production system, tags and a half-open validity interval. Context history is visible on the culture record. The editor requires an existing environment, prevents overlapping intervals at the application layer, requires an active interval to be explicitly closed before a successor is added, and scopes all reads and writes by organization and culture. Database RLS remains the authorization boundary. No production data was inserted by this implementation; the live project still has no biological-context rows.

## 9. Acceptance criteria for the first executable slice

- An authorized user can request an assessment for one culture/batch and a bounded window.
- Every input row is verified as belonging to the same organization and permitted biological scope.
- Repeating the same idempotency key with the same input returns the original execution; changing the input under that key is rejected.
- The input snapshot hash is stable for equivalent canonical input and changes when any included source record changes.
- The engine returns coverage and quality flags for complete, sparse, conflicting and empty input cases.
- No source record is modified.
- Result persistence is atomic and tenant-isolated.
- A failed or unavailable engine does not affect recording or viewing biological data.
- Automated tests cover cross-tenant access, mismatched culture/batch scope, excluded records, unit incompatibility, time gaps, malformed outputs and retry behavior.

## 10. Explicit implementation boundary

The deterministic engine, versioned registry manifest, schemas, authenticated source loader, temporal resolver, snapshot assembly and BIE orchestrator path now exist on the stacked feature branches. The orchestrator remains opt-in behind `BA_BIE_ENABLED=true`; the flag must remain unset until the deployment prerequisites and end-to-end checks below are complete.

The execution ledger and immutable result tables are defined by migrations in the BAL-Core/runtime branch. Empty source snapshots are valid only for `biological.context.features`, and both persistence tables must permit that engine-specific case so the engine can store an honest `insufficient_data` result. A regression test now covers this behavior.

The CultureOps execution-history interface has a dedicated BIE result renderer in PR #299. It presents coverage, source-linked observations, derived features, missing context and temporal gaps without interpreting result text as HTML. Its CI run passed all listed jobs after correcting the asset-version assertion.

**Production rollout is not complete.** A direct inspection of the connected Supabase project on 2026-11-12 found that the engine execution tables and the `engine-orchestrator` Edge Function are not deployed there, and the three engine-ledger migrations are absent from `supabase_migrations.schema_migrations`. No production migration, function deployment, worker configuration or BIE feature-flag activation has been performed.

Verification update (2026-11-12): PR #283 passed all 10 CI jobs, including the empty-snapshot persistence regression and migration replay. PR #299 passed all 10 CI jobs, including the BIE results UI browser smoke test. PR #294's biological-context editor tranche passed all 10 CI jobs, including browser smoke and migration replay. The subsequent database temporal-integrity migration, its SQL regression test, and the GreenTech plant-context capture tranche have been added to PR #294; their new CI run has not yet been observed.

Next steps: finish CI for PR #294; integrate the stacked PRs in dependency order; deploy the ledger migrations; deploy the orchestrator and Python worker; configure server-side worker credentials and the BIE flag only after the worker registry and authorization checks are verified; then run authenticated end-to-end tests for populated, missing-context and empty snapshots. The live project currently has no biological-context rows, so first populate and validate those records through CultureOps before expecting strain-specific context output. Keep biological recommendations, strain ranking and autonomous interventions out of scope until validated domain datasets and methods exist.


## Temporal integrity for biological contexts (2026-11-12)

- Migration `20261112040000_prevent_biological_context_overlap.sql` adds a PostgreSQL GiST exclusion constraint over tenant, domain, biological subject and the half-open date range `[valid_from, valid_to)`.
- The constraint rejects overlapping context windows even when writes bypass the CultureOps editor or occur concurrently; adjacent intervals remain valid because `valid_to` is exclusive.
- The existing validity check now rejects empty and inverted windows (`valid_to <= valid_from`), rather than permitting zero-length contexts.
- A migration preflight fails explicitly if legacy rows contain invalid or overlapping intervals; the production audit on 2026-11-12 found zero context rows and therefore no existing conflicts.
- Regression test `supabase/tests/biological_contexts_temporal_integrity.test.sql` checks the deployed constraint catalog entry, adjacency, overlap rejection, subject isolation and empty-window rejection.
- This migration is committed to PR #294 only. It has not been applied to the live Supabase project.


## GreenTech plant context capture (2026-11-12)

- The GreenTech plant registry now exposes a per-plant biological-context history panel.
- Reads and writes are scoped to the authenticated organization and the selected `plant_cultures.id`; records use `domain='greentech'`, `organism_kind='plant'`, `plant_culture_id`, and leave `culture_id` null.
- Species and cultivar are copied from the selected plant record; stage, production system, environment, substrate, tags and half-open validity interval are explicitly captured.
- The interface supports dated history, active-context closure and the same PostgreSQL overlap guard as Mycology/Laboratory.
- **Engine boundary:** the current BIE source loader and feature engine still analyse culture subjects only. GreenTech contexts are now captured consistently but are not yet consumed by BIE; plant-context resolution and a dedicated plant feature contract remain a separate implementation tranche.


## GreenTech BIE subject support (2026-11-12)

BIE v0.2.0 now supports authenticated plant-culture subjects without aliasing them to fungal cultures.

- Request scope uses `plant_culture_id`; the result subject uses `subject_type: "plant"` and preserves `plant_culture_id` separately from `culture_id`.
- The source loader reads `plant_cultures`, dated `biological_contexts` filtered to `domain = greentech`, and `measurements` filtered to `plant_culture_id`, all through the caller JWT and RLS.
- Environment resolution uses dated biological contexts and explicit per-measurement environment FKs. The plant record's mutable current `environment_id` is not used as historical fallback.
- External weather observations are loaded only when the full analysis window resolves to one environment and one organization-visible location.
- The Python engine reuses the deterministic descriptive feature pipeline but requires semantic version 0.2.0 for plant subjects. Version 0.1.0 remains available for existing culture callers.
- The result schema now explicitly models plant subjects. No diagnostic, causal or intervention claims were added.
- Production activation remains gated by `BA_BIE_ENABLED=true`; no flag, worker, Edge Function or schema was deployed during this tranche.


## Scoped rule-based interpretation (2026-11-13)

The biological context feature engine accepts an optional parameters.interpretation_rules array. Each rule is versioned and must declare:

- a stable rule identifier and semantic version;
- one derived feature code, a numeric comparison operator, threshold and unit;
- a non-empty exact-match biological context scope (taxon, strain, stage, substrate, production system or organism kind);
- a reference identifier and version.

The reference must also exist in the request dataset manifest under provider BA_LABS_RULE_REGISTRY, with an exact dataset_id and dataset_version match. The resulting finding carries the supporting source-record IDs, the derived feature code, rule version and reference identifier in its statement. The registry reference is added to result provenance.

Findings are emitted with evidence_state = limited. The rule evaluator does not infer causality, diagnose contamination or disease, rank strains, or recommend interventions. Rules with no matching biological context or no matching feature produce no finding. A malformed rule or unregistered reference fails the engine request rather than silently producing an untraceable result.

**Operational boundary:** this is an execution contract, not yet a populated scientific rule catalogue. The authenticated server-side adapter must load approved, versioned rules and include their manifest metadata in the request. No default biological thresholds are enabled, and the connected Supabase project has not yet been populated with a rule registry. The synthetic threshold used by the regression test is test data only, not a BA Labs cultivation recommendation.


## Tenant-scoped interpretation profile and scientific reference registry (2026-11-13)

The BIE orchestrator now resolves an active `domain_interpretation_profiles` record using the caller-JWT Supabase client. It selects the fixed profile code `biological.context.features` for the domain derived from dated biological contexts. The selected profile must cover the complete requested analysis window; a profile that starts mid-window or expires before the last included date is not applied. Rule evaluation is additionally disabled unless exactly one biological context covers the complete window, preventing a stage-specific threshold from being applied to measurements collected under a different stage. Ambiguous domains or multiple matching active profiles fail closed.

Every rule in the profile must use the Python engine rule contract and reference a matching `biological_reference_registry` row in the same organization with status `validated`. Draft, retired, missing, or cross-tenant references are never passed to the worker. The worker receives a profile manifest and one reference manifest per cited source, including content SHA-256 hashes and stable retrieval/review timestamps.

The execution ledger stores the resolved parameters and dataset manifest. Idempotency comparison includes the manifest, so a repeated key cannot silently reuse a result after the scientific profile or reference set changes. The Python result provenance includes both profile and reference identifiers with their hashes. A missing active profile is represented explicitly as `no_active_interpretation_profile`; it does not block descriptive analysis.

The migration `20261113110900_create_biological_reference_registry.sql` reconciles the existing profile-registry baseline into the repository migration chain and adds the tenant-scoped scientific reference table. Both registries are RLS-protected. Organization members can read; profile writes require organization writer rights; scientific reference lifecycle writes require owner/admin rights. Activated profiles and validated references are immutable, with retirement as the only controlled lifecycle transition.

No scientific reference records or active interpretation profiles have been seeded. The new reference registry migration is in the PR branch only; it has not been applied to the live Supabase project. The production database already contains the profile-registry objects in its migration history, but their original migration files were absent from this repository branch; the new baseline is additive and replay-safe.


## Versioned identity assertions and identity-scoped rules (2026-11-13)

The tenant-scoped `biological_identity_assertions` catalogue reuses canonical organism and strain records. Only reviewed, validated assertions whose source reference is also validated are eligible for BIE execution. Assertions are filtered against the complete analysis date window and the organism/strain IDs in the immutable biological-context snapshot. The resolver returns an explicit state: `documented`, `not_documented`, or `conflicting`; it never upgrades a free-text designation or an unresolved genetic reference into a validated identity.

Interpretation rules may optionally declare `identity_match: { assertion_type, assertion_value }`. Such a rule is evaluated only when the identity state is `documented` and a matching validated assertion belongs to the exact organism or strain ID in the biological context being evaluated. Missing, conflicting, or mismatched identities suppress that identity-scoped rule. Rules without `identity_match` retain their existing context-scoped behavior.

The assertion payload and its source-reference hash are included in the worker dataset manifest, result schema and provenance. The Python contract validates assertion structure and manifest linkage before returning identity data. The catalogue remains empty until BA Labs supplies and reviews real source material; test fixtures are synthetic and must not be interpreted as scientific content.
