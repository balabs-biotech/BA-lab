# BA Labs Python engines

This directory contains the Python-side contract boundary for isolated scientific engines.

## Contract validation

Install the package in an isolated environment:

```bash
python -m pip install -e .
python -m unittest discover -s tests -p "test_*.py" -v
```

The `ba_engine_contract` package validates request/result JSON Schema and cross-envelope invariants:
- supplied record IDs must match the immutable record snapshots exactly;
- a response must echo the originating request ID, engine ID/version and input snapshot hash;
- a worker result cannot be attached to a different request or data snapshot.

The schemas live in the repository-level `schemas/engine/v1` directory. Keep this package and those schemas in the same repository layout.

## Runtime boundary

A Python engine is a stateless compute worker. It receives only the authorized input snapshot and bounded parameters. It does not receive Supabase credentials, query tenant tables, mutate source records or persist results itself. The orchestrator authenticates and authorizes, schedules work, applies time/resource limits, validates the returned envelope and persists derived results.

Engine-specific algorithms belong in separate modules/packages. They must not make one engine a mandatory dependency of another.
