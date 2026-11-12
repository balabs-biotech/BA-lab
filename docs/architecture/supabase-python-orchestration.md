# Supabase ↔ Python engine orchestration contract

Status: interface and persistence foundation. No production worker endpoint is configured and no Edge Function dispatch is enabled by this change.

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

The adapter resolves the exact engine ID/version from its allowlisted registry and applies OS-level CPU, memory, timeout, network and filesystem restrictions. The Python runner's manifest declarations alone are not a sandbox.

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

This commit creates the durable database contract and documents the transport boundary. It does not claim that Python is reachable from Supabase, that a worker token exists, or that any production execution can run yet. The next implementation step is the authenticated Edge Function and its adapter-backed dispatch, followed by end-to-end tests against a local adapter.
