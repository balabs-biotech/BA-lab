# Supabase ↔ Python engine orchestration contract

Status: source implementation includes the authenticated Edge Function dispatch path, PostgreSQL execution ledger, Python HTTP adapter and container build. No worker has been deployed and no production dispatch has been enabled.

## Execution lifecycle

`public.engine_executions` is the durable tenant-scoped ledger. Its idempotency key is unique within an organization; a repeated request with the same key must return the existing execution only when engine identity, scope and input snapshot hash match. Reuse with different inputs is a conflict, never an overwrite.

States are `queued → running → completed|failed`. A completed result and a failed error are mutually exclusive. Source measurements, observations and environmental observations are never updated by engine execution.

Authenticated users may read executions for organizations they belong to. Direct client writes are revoked. The orchestration Edge Function must authenticate with the caller's JWT, verify organization membership and writer role (`owner`, `admin`, `member`), then use a server-only service credential for the ledger writes.

## Worker transport (HTTP adapter)

The Deno Edge Function must not attempt to import or spawn the Python CLI. A separately deployed adapter exposes:

- `POST /v1/execute`
- `Authorization: Bearer <worker-token>` (secret configured in the Edge Function environment; never committed)
- `Content-Type: application/json`
- Body: exact `BA-LABS/ENGINE` v1 request envelope from `schemas/engine/v1/request.schema.json`
- Response: exact `BA-LABS/ENGINE-RESULT` v1 envelope from `schemas/engine/v1/response.schema.json`

The adapter resolves the exact engine ID/version from its allowlisted registry. The container image is built from `engines/python/Dockerfile`, runs as UID 10001, and is intended to run read-only with dropped Linux capabilities, no-new-privileges, 256 MB memory, 1 CPU and a 64-process limit. The adapter executes each request in a child process and applies the registered manifest's wall-clock timeout (15 seconds for the current QC engine), terminating the child on expiry. Container CPU/memory quotas are enforced by the runtime; network ingress/egress policy remains a deployment-platform responsibility. The Python runner's manifest declarations alone are not a sandbox.

## Required orchestration invariants

1. Resolve all input rows through the caller-scoped client; never accept arbitrary cross-tenant row payloads from the browser.
2. Require every selected record to belong to the requested organization and requested scope.
3. Canonicalize the immutable input snapshot deterministically, hash it with SHA-256, and persist both hash and exact request payload before dispatch.
4. Use organization-scoped idempotency. Same key + same engine/version/scope/input hash/parameters returns the prior execution; changing scope or parameters under the same key returns HTTP 409.
5. Persist `running` before network dispatch. Use a bounded timeout and never retry non-idempotent worker calls without the same request ID.
6. Validate the response schema and correlate request ID, execution ID, engine ID/version and input snapshot hash before accepting any result.
7. Persist the complete validated result envelope; keep quality flags, limitations and provenance intact.
8. On timeout, malformed response or adapter failure, mark only that execution failed with a safe error code. Do not mutate or delete source records.
9. Keep adapter URL/token as deployment secrets. No production deployment is part of this contract.

## Current boundary

The repository now contains the durable database contract, authenticated Edge Function, standard-library HTTP adapter, non-root Docker image and black-box container smoke test. CI builds the image, starts it with a test-only token, and checks health, authentication, registered-engine dispatch and result correlation. This does not establish production reachability: the image is not deployed, no worker URL/token is configured in Supabase, and no production execution has run.

## Implemented Edge Function boundary

`supabase/functions/engine-orchestrator/index.ts` now implements the first authenticated dispatch path.

### Input

`POST /functions/v1/engine-orchestrator`

JSON body:
```json
{
  "organization_id": "<uuid>",
  "engine_id": "environmental.timeseries.qc",
  "engine_version": "0.2.0",
  "record_ids": ["<measurement-uuid>"],
  "scope": { "culture_id": "<optional-uuid>" },
  "parameters": { "max_gap_minutes": 180 },
  "idempotency_key": "client-generated-stable-key"
}
```

The caller may also send `Idempotency-Key` as a header. The endpoint currently accepts measurement IDs only and limits one call to 500 records. It reads records through the caller JWT and checks membership plus writer role before using the server credential. The only enabled engine is the exact `environmental.timeseries.qc@0.2.0` registry entry.

### Required Edge Function secrets

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `BA_ENGINE_WORKER_URL`
- `BA_ENGINE_WORKER_TOKEN`

The inbound Edge Function request is capped at 48 KB; the canonical worker request is capped at 240 KB before dispatch, the adapter accepts at most 256 KB, and the worker response body is capped at 128 KB. The worker call is capped at 20 seconds. The endpoint validates the request and response schemas, verifies request/engine/snapshot correlation, persists the full completed envelope, and stores safe failure codes. The source measurement rows are read-only throughout this flow.

The static CI contract check is `scripts/test-engine-orchestrator-contract.mjs`. It checks that the security and isolation boundaries remain present; it is not a substitute for an integration test against a deployed worker.

### Deployment boundary

The function source is committed but not deployed. No worker URL/token is configured here, no Supabase production migration was applied, and no end-to-end execution has yet been demonstrated. The next verification gate is a local PostgreSQL migration replay plus an authenticated Edge Function integration test against a disposable worker adapter.

## Python HTTP worker adapter

`engines/python/ba_engine_contract/http_adapter.py` exposes the registry through the matching HTTP transport:

- `POST /v1/execute` accepts the versioned request envelope and returns the validated result envelope.
- `GET /healthz` returns a minimal readiness response without exposing configuration.
- Bearer token comparison is constant-time; tokens shorter than 24 characters are rejected.
- Request body is capped at 256 KB, content type is checked, socket reads have a timeout, and concurrency is bounded to two requests. The Edge Function applies a stricter 240 KB serialized-request cap before dispatch.
- Unknown engine versions and invalid request contracts are rejected by the shared registry/validator.
- The adapter uses only Python's standard library; it is exposed as `ba-engine-http-worker`.

Runtime configuration: `BA_ENGINE_WORKER_TOKEN` (required), `BA_ENGINE_HTTP_HOST` (default `0.0.0.0`), and `BA_ENGINE_HTTP_PORT` (default `8080`). Run it behind a TLS-terminating reverse proxy and inside a container/runtime that enforces the manifest's CPU, memory, filesystem, network and process-time limits. The adapter itself is not an OS sandbox and is not deployed by this repository change.


## Container build and runtime

Build from the repository root:

```sh
docker build -f engines/python/Dockerfile -t ba-labs-engine-worker:0.1.0 .
```

The image contains the Python package, versioned engine registry and `schemas/engine/v1`. It exposes port 8080 and requires `BA_ENGINE_WORKER_TOKEN` at runtime. See `engines/python/README.md` for the hardened `docker run` invocation and network placement requirements.

CI builds the image and executes `scripts/test-engine-worker-container.py` against a running container with a disposable token. The smoke test checks readiness, rejects unauthenticated execution, runs the registered environmental QC engine and verifies the result's request/engine/snapshot correlation.


The installed Python package accepts `BA_ENGINE_SCHEMA_DIR` and `BA_ENGINE_REGISTRY_DIR` so schemas and manifests can live outside the Python site-packages directory. The container sets both paths explicitly to the copied, versioned repository assets.


## CultureOps execution history surface

The overview now reads the latest eight rows from `public.engine_executions` using the authenticated Supabase client and an explicit active-organization filter. RLS remains the authorization boundary. The panel presents lifecycle state, engine/version, timestamp, measurement/series counts, excluded-record count and quality flags; failed runs expose only the safe error code. It does not render arbitrary worker payloads or raw error messages.

The history loader is bound to the active workspace revision and organization. Tenant transitions clear the in-memory execution list and visible panel before a new organization can load. The UI contract is checked by `scripts/test-engine-execution-history-ui.mjs` in the batch-tracker CI audit.


## Structured analytical result persistence

A successful execution is committed through the service-only `public.complete_engine_execution` RPC. In one PostgreSQL transaction it:
- locks and verifies the matching `running` execution;
- checks request ID, engine ID/version and input snapshot hash against the immutable ledger row;
- validates the required result fields;
- inserts one immutable `engine_execution_results` row;
- transitions the execution ledger to `completed` with the full versioned response envelope.

The result table is query-oriented: engine/result type, outcome, structured value, limitations, quality flags, optional calibrated confidence, provenance, input record IDs, input snapshot hash and generation timestamp are independently addressable. It is tenant-scoped under RLS and read-only to authenticated organization members. Database triggers reject result updates; tenant cleanup can remove records through privileged parent deletion cascades. A new interpretation requires a new execution.

CultureOps reads recent execution status from `engine_executions` and structured outputs from `engine_execution_results`. The UI retains a compatibility fallback to the envelope stored in the execution ledger while older records are being migrated. Neither table modifies source measurements.


## Environmental observation input — weather time series

The orchestrator now supports two explicit source types. Existing requests remain backward compatible: omitting `record_type` means `measurement`.

To run the deterministic QC engine against externally sourced weather observations, send:

```json
{
  "organization_id": "<uuid>",
  "engine_id": "environmental.timeseries.qc",
  "engine_version": "0.2.0",
  "record_type": "environmental_observation",
  "record_ids": ["<environmental-observation-uuid>"],
  "scope": { "location_id": "<location-uuid>" },
  "parameters": { "max_gap_minutes": 1800 },
  "idempotency_key": "stable-client-generated-key"
}
```

The function reads `environmental_observations` through the caller-scoped Supabase client and RLS, with explicit organization, location and `data_family = weather` filters. It requires all selected rows to belong to one provider/dataset pair; a run cannot silently mix weather products. The immutable request snapshot includes the stored analytical value and unit, observation/retrieval timestamps, provider, dataset, spatial resolution and quality flag. Each record also carries a SHA-256 digest of the complete source row (including source URL and metadata), so large provider metadata is not duplicated into the worker payload while remaining integrity-bound to the execution.

The QC engine reads these values from the environmental-observation shape (`value`, `unit_code`, `observed_at`) without relabeling them as normalized sensor measurements. It groups series by variable and stored unit, reports source provider/dataset in `provenance.source_references`, and flags coverage gaps/duplicates/outliers only. The engine does not rescale gridded values to parcel resolution or infer crop stress.

This path currently accepts weather observations only. Satellite rows are deliberately not accepted by this time-series entrypoint: Sentinel-2 rasters and derived NDVI need a separate, spatially aware processing contract with valid-pixel fraction, cloud/shadow masking, geometry/version and processing provenance. A scene catalogue or rendered preview is not itself a persisted analytical observation.
