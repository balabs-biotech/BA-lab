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
4. Use organization-scoped idempotency. Same key + same engine/version/scope/hash returns the prior execution; same key with any mismatch returns HTTP 409.
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
  "engine_version": "0.1.0",
  "record_ids": ["<measurement-uuid>"],
  "scope": { "culture_id": "<optional-uuid>" },
  "parameters": { "max_gap_minutes": 180 },
  "idempotency_key": "client-generated-stable-key"
}
```

The caller may also send `Idempotency-Key` as a header. The endpoint currently accepts measurement IDs only and limits one call to 500 records. It reads records through the caller JWT and checks membership plus writer role before using the server credential. The only enabled engine is the exact `environmental.timeseries.qc@0.1.0` registry entry.

### Required Edge Function secrets

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- `BA_ENGINE_WORKER_URL`
- `BA_ENGINE_WORKER_TOKEN`

The worker call is capped at 20 seconds; the response body is capped at 128 KB. The endpoint validates the request and response schemas, verifies request/engine/snapshot correlation, persists the full completed envelope, and stores safe failure codes. The source measurement rows are read-only throughout this flow.

The static CI contract check is `scripts/test-engine-orchestrator-contract.mjs`. It checks that the security and isolation boundaries remain present; it is not a substitute for an integration test against a deployed worker.

### Deployment boundary

The function source is committed but not deployed. No worker URL/token is configured here, no Supabase production migration was applied, and no end-to-end execution has yet been demonstrated. The next verification gate is a local PostgreSQL migration replay plus an authenticated Edge Function integration test against a disposable worker adapter.

## Python HTTP worker adapter

`engines/python/ba_engine_contract/http_adapter.py` exposes the registry through the matching HTTP transport:

- `POST /v1/execute` accepts the versioned request envelope and returns the validated result envelope.
- `GET /healthz` returns a minimal readiness response without exposing configuration.
- Bearer token comparison is constant-time; tokens shorter than 24 characters are rejected.
- Request body is capped at 48 KB, content type is checked, socket reads have a timeout, and concurrency is bounded to two requests.
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
