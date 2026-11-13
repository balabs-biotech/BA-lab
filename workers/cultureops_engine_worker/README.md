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
- background lease heartbeat during engine execution;
- conservative handling of heartbeat uncertainty: a worker that cannot confirm its lease does not write success or failure;
- unit tests for registry resolution, failure isolation, heartbeat and stale-lease behavior.

It deliberately does not connect to Supabase yet. Durable queue claiming, lease storage, fencing-token validation, retry scheduling and result persistence remain database-adapter responsibilities and are not operational until the SQL migration and integration tests exist.

## Local checks

From the repository root:

```bash
PYTHONPATH=workers/cultureops_engine_worker/src python -m unittest discover -s workers/cultureops_engine_worker/tests -v
```

No third-party Python dependency is required for the worker-core tests.

## Design constraints

1. Engines are resolved by exact `engine_code` and `engine_version`; no implicit "latest" resolution.
2. Each engine invocation receives an immutable execution context and a mapping payload.
3. The registry does not own queue state or database connections.
4. Engine failures are isolated to the claimed job and classified by an explicit retry policy.
5. The worker renews the lease in a background thread; heartbeat failure or uncertainty prevents result/failure writes.
6. Completion and failure must still re-check the fencing token transactionally in PostgreSQL.
7. Heavy scientific libraries belong in optional engine-specific dependency groups, not in the queue/registry core.
