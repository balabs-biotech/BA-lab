# BA Labs Python engines

This directory contains the Python-side contract boundary for isolated scientific engines.

## Contract validation

Install the package in an isolated environment:

```bash
python -m pip install -e .
python -m unittest discover -s tests -p "test_*.py" -v
```

The `ba_engine_contract` package validates request/result JSON Schema, enforces cross-envelope invariants and exposes a minimal stateless execution wrapper:
- supplied record IDs must match the immutable record snapshots exactly;
- a response must echo the originating request ID, engine ID/version and input snapshot hash;
- a worker result cannot be attached to a different request or data snapshot.

The schemas live in the repository-level `schemas/engine/v1` directory. Keep this package and those schemas in the same repository layout.

## Runtime boundary

A Python engine is a stateless compute worker. It receives only the authorized input snapshot and bounded parameters. It does not receive Supabase credentials, query tenant tables, mutate source records or persist results itself. The orchestrator authenticates and authorizes, schedules work, applies time/resource limits, validates the returned envelope and persists derived results.

The `execute_engine` wrapper binds execution to the registered engine ID/version, builds a completed or typed-failure envelope, and validates the response before returning it. It deliberately does not pretend to enforce hard process timeouts: the deployment/orchestrator must terminate workers that exceed their wall-clock or resource budget.\n\nEngine-specific algorithms belong in separate modules/packages. They must not make one engine a mandatory dependency of another.


## HTTP worker container

Build from the repository root so the versioned engine schemas are included:

```sh
docker build -f engines/python/Dockerfile -t ba-labs-engine-worker:0.1.0 .
```

Run with a unique secret of at least 24 characters:

```sh
docker run -d --name ba-engine-worker \
  --publish 127.0.0.1:8080:8080 \
  --env BA_ENGINE_WORKER_TOKEN="$BA_ENGINE_WORKER_TOKEN" \
  --read-only --cap-drop=ALL --security-opt=no-new-privileges \
  --memory=256m --cpus=1 --pids-limit=64 --user=10001:10001 \
  ba-labs-engine-worker:0.1.0
```

The container runs as UID/GID 10001, has a read-only root filesystem and drops Linux capabilities. Do not publish the port publicly. Place it behind a TLS-terminating reverse proxy or private service network, restrict inbound traffic to the Supabase Edge Function egress path, and enforce an outbound-deny network policy. The worker itself does not need database or external network access.

The adapter launches each registered engine in a separate Python worker process and enforces the manifest's 15-second wall-clock deadline by terminating that process on timeout. The container's 256 MB memory cap and 1 CPU limit are enforced by the container runtime; outbound network policy remains a deployment-platform responsibility. The process deadline is a wall-clock limit, not a per-process CPU quota. Deploy only reviewed, allowlisted engines; this image is not a complete hostile-code sandbox.

Health check: `GET /healthz`. Execution endpoint: authenticated `POST /v1/execute`.

Container paths are configured with `BA_ENGINE_SCHEMA_DIR=/app/schemas/engine/v1` and `BA_ENGINE_REGISTRY_DIR=/app/engines/python/registry`; override these only when relocating those assets. Required environment: `BA_ENGINE_WORKER_TOKEN` (random secret, minimum 24 characters); optional `BA_ENGINE_HTTP_HOST` (default `0.0.0.0`) and `BA_ENGINE_HTTP_PORT` (default `8080`). No secret is baked into the image. Configure the matching token in the Supabase Edge Function environment and set `BA_ENGINE_WORKER_URL` to the private HTTPS endpoint. Rotate both sides together.
