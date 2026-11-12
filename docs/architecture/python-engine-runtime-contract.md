# Python scientific engine runtime contract v1

## Purpose and boundary

Python engines are isolated analytical workers. They receive a versioned request envelope and return a versioned result envelope. They do not authenticate end users, query tenant tables directly, write source records, or deploy migrations. CultureOps and Supabase remain responsible for identity, authorization, canonical persistence and workflow state.

## Contract files

- `schemas/engine/v1/request.schema.json`: immutable input envelope.
- `schemas/engine/v1/response.schema.json`: completed or failed execution envelope.
- `schemas/engine/v1/manifest.schema.json`: declarative engine registry and sandbox/resource policy.
- `engines/python/registry/`: versioned engine registrations; the first QC engine has no database, network, external-data or filesystem-write capability.
- `engines/python/ba_engine_contract/`: request/result validators and the first deterministic QC implementation.
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

1. Version and test the request, response and manifest schemas.
2. Validate request/result correlation and immutable record snapshots in the Python contract package.
3. Execute registered engines through a stateless typed runner that validates all returned envelopes.
4. Register the deterministic environmental QC engine with explicit sandbox capabilities and bounded resource declarations.
5. Add a deployment adapter that enforces hard process timeouts, memory/CPU limits, concurrency, cancellation and idempotency. The in-process Python runner does not itself provide OS-level sandboxing or hard resource enforcement.
6. Add external provider adapters and biological interpretation only after the worker lifecycle and evidence requirements are verified.

## Registry and worker invocation

Registered engines are resolved by the exact pair `engine_id + engine_version` from `engines/python/registry/`. The registry loader validates the manifest, restricts entrypoints to the `ba_engine_contract.*` package namespace, and refuses missing or mismatched registrations.

The worker accepts one JSON request on standard input and writes one JSON result envelope to standard output:

```bash
printf '%s' "$ENGINE_REQUEST_JSON" | ba-engine-worker
```

The CLI returns exit code 0 for a valid execution result, 2 for invalid input or an unregistered engine, and 3 for an unexpected worker-level failure. Diagnostics go to standard error; credentials and raw exception text are not emitted. The worker is a process entrypoint, not a sandbox by itself: its host/container must enforce the manifest's timeout, memory, filesystem and network restrictions.

## First reference engine: environmental time-series QC

The first implementation is `engines/python/ba_engine_contract/environmental_timeseries_qc.py`. It is deliberately a deterministic quality-control engine, not a biological recommendation engine.

It groups normalized measurements by `(variable_code, normalized_unit_code)`, requires timezone-aware timestamps, sorts each series, reports sampling gaps and duplicate timestamps, and flags robust statistical outliers using the median absolute deviation (MAD). Records without a usable normalized value, unit, variable code or timestamp are excluded with a record-level reason.

The engine does not:
- infer heat stress, contamination, growth inhibition or disease;
- issue humidification, aeration or culture-condition recommendations;
- treat a statistical outlier as a confirmed measurement error;
- fetch NASA POWER, Sentinel-2 or any other remote dataset itself.

Those functions belong in separate engines/adapters after data provenance, calibration and biological decision rules are specified. The current implementation uses Python's standard library only. Its test fixtures are offline and deterministic; execution timestamps and execution IDs are envelope metadata.

## Deliberately not defined by v1

- Transport (HTTP, queue or direct process invocation).
- Worker deployment target and container image policy.
- Per-engine parameter schemas and enforcement of resource budgets by the deployment adapter.
- Result retention period and human-review workflow.

These are orchestration/deployment decisions and should not be hidden inside the data contract.
