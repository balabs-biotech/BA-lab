# CultureOps Engine Worker

Python 3.10+ worker foundation for the CultureOps execution architecture.

## Free development workflow

- PostgreSQL/Supabase Free remains the hosted data plane.
- GitHub stores versioned source and CI tests.
- The worker runs locally on the BA Labs development PC.
- No paid Supabase branch, paid compute service, or always-on worker is required.
- Queue database changes are developed as migrations and tested against a disposable PostgreSQL 17 instance before any deployment.

## Current scope

The package contains:
- an exact-version engine contract and registry;
- a single-job worker boundary;
- a standard-library PostgREST adapter for the queue RPC contract;
- background lease heartbeat during engine execution;
- conservative handling of heartbeat uncertainty: a worker that cannot confirm its lease does not write success or failure;
- unit tests for registry resolution, failure isolation, heartbeat and stale-lease behavior.

The PostgREST adapter is implemented against the public, least-privilege RPC contract and has mocked transport tests. The database contract currently exists as a disposable PostgreSQL 17 CI fixture, not as an applied Supabase migration. Do not point the adapter at production until the CLI-generated migration has been reviewed and deployed separately.

## Local checks

From the repository root:

```bash
PYTHONPATH=workers/cultureops_engine_worker/src python -m unittest discover -s workers/cultureops_engine_worker/tests -v
```

No third-party Python dependency is required for the worker-core and mocked adapter tests.

The future local worker process will read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from its environment. The service-role key is backend-only: never place it in frontend code, commit it, or paste it into source files.

## Design constraints

1. Engines are resolved by exact `engine_code` and `engine_version`; no implicit "latest" resolution.
2. Each engine invocation receives an immutable execution context and a mapping payload.
3. The registry does not own queue state or database connections.
4. Engine failures are isolated to the claimed job and classified by an explicit retry policy.
5. The worker renews the lease in a background thread; heartbeat failure or uncertainty prevents result/failure writes.
6. Completion and failure must still re-check the fencing token transactionally in PostgreSQL.
7. Heavy scientific libraries belong in optional engine-specific dependency groups, not in the queue/registry core.
