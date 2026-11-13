# BA Labs engine composition and lineage contract v1

Status: implementation contract for the next integration slice. This document does not claim that cross-engine execution is already wired or deployed.

## 1. Current state and integration gap

The repository currently contains two independently invocable Python engines:

- `environmental.timeseries.qc@0.2.0`: screens measurement and weather time series for missing/invalid values, duplicate timestamps, sampling gaps and robust statistical outliers.
- `biological.context.features@0.2.0`: builds a time-bounded biological context assessment from caller-authorized culture/plant records, local measurements and location-scoped weather observations.

Both use the same versioned request/response contract, isolated worker, authenticated Edge orchestration, immutable execution ledger and result persistence.

They are **not yet a composed workflow**. A QC result is not currently loaded as an upstream artifact by BIE. BIE independently evaluates the raw records in its own immutable snapshot. This is a valid isolated execution model, but it does not yet provide explicit cross-engine lineage or reuse of upstream QC findings.

## 2. Composition model

The first composed workflow is an optional two-stage path:

`authenticated source snapshot → environmental QC → validated QC result artifact → biological context features → persisted BIE assessment`

The QC stage and BIE stage remain separate engine executions. Do not import one engine's Python module into another engine, share mutable in-memory state, or allow a worker to query Supabase or external services.

The workflow coordinator belongs in the authenticated Supabase orchestration layer. It resolves and validates upstream execution records, then passes a bounded immutable artifact to the downstream worker.

## 3. Upstream artifact contract

A downstream request may reference upstream executions by immutable execution ID. The client may submit identifiers, but never an upstream result payload.

For every upstream reference, the orchestrator must verify:

1. the execution and result belong to the caller's organization;
2. the execution is terminal and successful;
3. the engine ID and semantic version are allowlisted for this dependency edge;
4. the result row exists and its execution ID matches the ledger row;
5. the upstream result's input snapshot digest matches the upstream ledger;
6. subject, location, analysis window and relevant scope match the downstream request;
7. the result artifact is within strict byte, record and nesting limits;
8. the stored result digest is recomputed and matches before it is forwarded.

A failed, running, expired, inaccessible or mismatched upstream execution must not be treated as a successful artifact. The coordinator returns a stable error code and does not invoke the downstream worker.

The downstream request must carry a minimal, versioned upstream artifact envelope containing:
- upstream execution ID;
- engine ID and semantic version;
- upstream input snapshot SHA-256;
- canonical result SHA-256;
- completion timestamp;
- validated scope summary;
- bounded structured result payload.

The downstream worker must validate the envelope schema and bind its execution to the artifact digests. It must not trust a client-provided digest without recomputing it.

## 4. Environmental QC → BIE semantics

The QC result is an evidence-quality annotation, not a biological diagnosis.

BIE may use upstream QC output to:
- surface duplicate timestamps and temporal gaps;
- annotate measurements flagged as statistical outliers;
- expose QC coverage and exclusions in the assessment;
- identify which source records need human review.

BIE must not automatically delete, overwrite, or silently discard an outlier solely because the QC engine flagged it. An outlier flag is a review signal, not proof of measurement error.

BIE must preserve:
- the original raw source record IDs;
- the QC execution ID and result digest;
- each QC flag and the record IDs it concerns;
- its own derived feature methods and provenance.

A QC result from a different location, time window, provider/dataset identity or biological scope must be rejected for the BIE execution.

## 5. Ledger and lifecycle requirements

Cross-engine lineage must be durable and tenant-scoped. It must not rely only on JSON embedded in the worker request.

The implementation must add immutable parent/child linkage or an equivalent normalized dependency table with:
- organization ID;
- downstream execution ID;
- upstream execution ID;
- dependency role;
- upstream result digest;
- creation timestamp.

Constraints must prevent self-dependency and duplicate edges. Reads must be tenant-scoped. Writes must be service-only and transactionally bound to execution creation. Upstream result rows are immutable and remain independently addressable.

The first release supports only a fixed, allowlisted edge:
`environmental.timeseries.qc@0.2.0 → biological.context.features@0.2.0`.

Do not expose arbitrary client-defined DAGs, recursive workflows, cycles, fan-out, or unbounded dependency depth in v1.

## 6. Failure isolation and execution policy

- Environmental QC may fail without corrupting or cancelling the source records.
- If QC is explicitly required by a workflow request, BIE must not start unless QC completed and passed artifact validation.
- If QC is optional, BIE may run without it, but the result must explicitly state that upstream QC was unavailable/not requested.
- A downstream execution failure must not mutate or invalidate the upstream result.
- Retries create a new downstream execution or reuse the exact idempotent execution; they must not silently substitute a different upstream result.
- Existing lease ownership, bounded queue claims, bounded worker responses and atomic result persistence remain mandatory.

## 7. Required contract tests before enabling the workflow

- valid same-tenant completed QC result is accepted;
- cross-tenant upstream execution is rejected;
- queued/running/failed/expired upstream execution is rejected;
- wrong engine ID/version is rejected;
- different location, subject or analysis window is rejected;
- altered result payload with stale digest is rejected;
- oversized upstream artifact is rejected before worker dispatch;
- duplicate dependency and self-dependency are rejected;
- QC outlier flags are propagated as review annotations, not silently converted to exclusions;
- BIE can run in explicitly optional mode when no QC execution is supplied;
- worker and dispatcher cannot manufacture or replace upstream execution IDs;
- parent/child lineage is persisted atomically and remains immutable.

## 8. Rollout boundary

This contract is not enabled by this documentation change. Implementation must land behind a server-side feature flag, with production default off. The first end-to-end test must use synthetic fixtures and an isolated database. Enablement requires successful migration replay, Edge contract tests, worker tests, tenant-isolation tests and a recorded deployment/rollback procedure.

No production migration, Edge deployment, worker hosting or feature-flag change is authorized by this contract.
