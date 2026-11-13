# CultureOps Engine Worker

Python 3.10+ worker foundation for the CultureOps execution architecture.

## Free development workflow

- PostgreSQL/Supabase Free remains the hosted data plane.
- GitHub stores versioned source and CI tests.
- The worker runs locally on the BA Labs development PC.
- No paid Supabase branch, paid compute service, or always-on worker is required.
- Queue database changes are developed as migrations and tested against a disposable local PostgreSQL instance before any deployment.

## Current scope

This package currently contains the engine contract and an in-memory, version-aware registry. It deliberately does not connect to Supabase yet. Queue claiming, leases, heartbeat, fencing tokens, retries, and persistence must be added only after their SQL contract and regression tests are implemented.

## Local checks

From this directory:

```bash
python -m unittest discover -s tests -v
```

No third-party Python dependency is required for the registry tests.

## Design constraints

1. Engines are resolved by exact `engine_code` and `engine_version`; no implicit "latest" resolution.
2. Each engine invocation receives an immutable execution context and a JSON-compatible payload.
3. The registry does not own queue state or database connections.
4. Engine exceptions are allowed to propagate to the worker boundary, where one failed job must not terminate the polling loop.
5. The worker must later use lease tokens/fencing to prevent stale workers from committing results.
6. Heavy scientific libraries belong in optional engine-specific dependency groups, not in the queue/registry core.
