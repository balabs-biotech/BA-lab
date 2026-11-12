# Biological Intelligence Engine — architecture contract v1

Status: design contract. This document defines the first safe integration boundary; it does not claim that biological inference is implemented or deployed.

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

BIE returns the existing `BA-LABS/ENGINE-RESULT` envelope. Its structured result must use a versioned result type, initially `biological.context_assessment.v1`.

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

Implementation update (2026-11-12): the first deterministic Python feature engine, `biological.context.features@0.1.0`, and its registry manifest are present on the BIE feature branch. It accepts an already-authorized immutable snapshot for one culture and computes descriptive series statistics, temporal gaps, coverage, source-linked observations and quality flags. A separate pure TypeScript resolver now interprets `biological_contexts.valid_from/valid_to` in the requested timezone, checks each measurement against its explicit `measurements.environment_id`, and refuses overlapping contexts, mismatches, missing historical links, or an analysis window spanning multiple contexts. It deliberately ignores the culture's current `environment_id` as a historical fallback. The resolver is covered by a focused CI test. The resolver is now composed with the snapshot adapter in `supabase/functions/_shared/biological-context-assembly.ts`. The assembly uses the historically resolved environment rather than the mutable culture FK, attaches each measurement's resolution status, and admits external weather observations only when the full requested window maps to one unambiguous environment/location. Ambiguous, conflicting or missing context is preserved in the engine parameters/coverage instead of silently selecting an environment. The exclusive `valid_to` boundary and half-open analysis window are interpreted in the requested timezone. The pure assembly is covered by CI tests. A first authenticated loader now exists in `supabase/functions/_shared/biological-context-loader.ts`: it accepts only a caller-scoped Supabase client, reads the culture, dated contexts, measurements, environments and visible locations under that client's RLS, enforces row-count bounds, and only queries weather when the complete window has one resolved location. Its mock-client contract test is in CI. The loader is not yet invoked by `engine-orchestrator`; BIE is not enabled in the orchestrator allowlist and is not deployed.

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

This contract is a design artifact on top of the BAL-JSON/BAL-Core/Python-engine branch. The schema, production read-model audit, deterministic feature engine, pure snapshot adapter and pure temporal context resolver are present on the feature branch; none of this means the authenticated BIE data path or production deployment is complete.

The next code task is to connect the resolver and snapshot adapter to the existing authenticated `engine-orchestrator`: load culture, dated biological contexts, environments/locations and measurements under the caller JWT/RLS; resolve the analysis window; fetch external weather only for one unambiguous location; then build and persist the immutable BIE execution. Keep the BIE allowlist closed until end-to-end tenant-scope, temporal-conflict, idempotency and persistence tests pass. Do not begin recommendations or strain ranking before those gates pass.
