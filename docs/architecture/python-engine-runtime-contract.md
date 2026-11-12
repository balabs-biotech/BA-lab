# Python scientific engine runtime contract v1

## Purpose and boundary

Python engines are isolated analytical workers. They receive a versioned request envelope and return a versioned result envelope. They do not authenticate end users, query tenant tables directly, write source records, or deploy migrations. CultureOps and Supabase remain responsible for identity, authorization, canonical persistence and workflow state.

## Contract files

- `schemas/engine/v1/request.schema.json`: immutable input envelope.
- `schemas/engine/v1/response.schema.json`: completed or failed execution envelope.
- `engines/python/tests/test_engine_contract.py`: executable contract and negative-case tests.

Both schemas use JSON Schema Draft 2020-12. A contract version change that breaks compatibility requires a new versioned schema path; do not silently widen v1.

## Request envelope

Every request carries:

- `request_id`: stable UUID for one logical execution request.
- `engine.engine_id` and `engine.engine_version`: exact registered implementation identity.
- `scope.organization_id` and optional biological/environmental scope IDs.
- `input.record_ids`: unique source record IDs.
- `input.records`: immutable snapshots supplied by the trusted orchestrator, not database credentials or live database handles.
- `input.snapshot_sha256`: SHA-256 identity of the exact input snapshot; the worker must echo it unchanged.
- `parameters`: engine-specific parameters. The engine validates its own parameter contract before analysis.
- `datasets`: optional external dataset identity, version, retrieval timestamp and content hash.

Recommendation: compute the snapshot hash in the trusted orchestration layer over a canonical JSON representation (RFC 8785/JCS) and verify it before dispatch. Do not hash arbitrary whitespace-formatted JSON and assume it is a stable identity.

## Response envelope

Every response echoes `request_id`, engine identity and `input_snapshot_sha256`, and adds a unique `execution_id` plus start/completion timestamps.

- `status=completed` requires `result` and forbids `error`.
- `status=failed` requires `error` and forbids `result`.
- A completed result uses `outcome=success`, `insufficient_data`, `out_of_domain` or `review_required`.
- `value` is engine-specific structured output; it must not overwrite source measurements or observations.
- `limitations`, `quality_flags` and `provenance` are mandatory, including when their arrays are empty.
- `confidence` is optional. Include it only when a defensible calibration method and calibration reference are supplied; never use an uncalibrated model score as scientific confidence.
- `error.retryable` tells the orchestrator whether a retry is appropriate. Validation failures and out-of-domain results are not transient execution failures.

## Execution and isolation recommendations

1. Keep workers stateless between requests. Persist execution state in the orchestration layer, not module globals.
2. Give each engine a bounded wall-clock timeout, memory/CPU budget and explicit concurrency limit.
3. Pass only the minimum authorized snapshot needed for the analysis. Do not pass Supabase service keys or end-user bearer tokens to Python workers.
4. Treat external providers as optional dependencies. Provider timeout or missing coverage returns a typed failure/limitation and must not block manual data capture or unrelated engines.
5. Retry only transient failures, using the same `request_id` and immutable snapshot. Create a new request when inputs or parameters change.
6. Validate every response against the response schema before storing it as a derived analysis artifact.
7. Store derived results separately from source records, keyed by request, engine version and input snapshot hash.

## Delivery sequence

1. Land and test these v1 schemas.
2. Add a Python contract package that loads schemas and validates envelopes.
3. Implement a minimal worker runner with timeout, structured logs and typed errors.
4. Implement one deterministic engine (environmental time-series quality checks) using fixtures, without external network calls.
5. Add provider adapters and biological interpretation only after the deterministic worker lifecycle is verified.

## Deliberately not defined by v1

- Transport (HTTP, queue or direct process invocation).
- Worker deployment target and container image policy.
- Per-engine parameter schemas and resource budgets.
- Result retention period and human-review workflow.

These are orchestration/deployment decisions and should not be hidden inside the data contract.
