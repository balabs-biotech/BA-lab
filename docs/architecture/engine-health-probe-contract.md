# Engine health — probe contract proposal

**Reviewed against:** active `public.engine_registry` schema and seven registered engines  
**Date:** 15 November 2026  
**Status:** design only; no health values or schema were changed.

## 1. Current state

The registry already exposes:
- `status`: `draft | active | disabled | retired`
- `health_status`: `unknown | healthy | degraded | unavailable`
- `last_healthcheck_at`: nullable timestamp

All seven registered engines currently have `health_status = unknown` and `last_healthcheck_at = NULL`. This is the correct state until real probes exist. Registry presence, a successful migration, or an empty queue is not evidence that a runtime is healthy.

## 2. Separate lifecycle from health

Do not overload `status`:
- `draft`: not eligible for production execution.
- `active`: eligible for enqueue/dispatch.
- `disabled` / `retired`: intentionally unavailable for new work.

Health is an observation of runtime/dependency state, not an authorization state:
- `unknown`: no valid probe has run, or evidence is insufficient.
- `healthy`: all mandatory probes passed within their freshness window.
- `degraded`: runtime is reachable, but a non-critical dependency or recent execution quality is impaired.
- `unavailable`: a mandatory runtime/dependency probe failed repeatedly.

A job failure alone must not set an engine to unavailable; distinguish invalid input, biological QC rejection, transient provider error, and runtime failure.

## 3. Probe matrix

| Engine class | Mandatory probe | Evidence | Do not infer |
|---|---|---|---|
| Worker interpreter | Worker runtime can resolve the registered handler and validate its contract | handler registry/version match; bounded dry-run or startup self-test | A database connection alone does not prove handler health |
| Edge Function | Authenticated health route returns bounded readiness metadata | deployed function version, dependency readiness, response time | HTTP 200 from a normal job endpoint is not a health probe |
| Scheduled importer | Scheduler secret verifier and provider reachability check | verifier succeeds; provider metadata endpoint responds | No scheduled job today does not mean unhealthy |
| Core orchestrator | Queue RPC reachability and lease lifecycle smoke test in isolated CI | claim/heartbeat/finish contract test | Production synthetic jobs should not be created without an explicit policy |

For external providers, probe only lightweight metadata/health endpoints. Do not download imagery or ingest data during a health check.

## 4. State transition rules

- Probe success updates `last_healthcheck_at`; set `healthy` only if every mandatory probe passes.
- One transient failure moves `healthy` to `degraded`, not directly to `unavailable`.
- Repeated mandatory failures across a configured window may move `degraded` to `unavailable`.
- Recovery requires a successful probe; a registry edit must not reset health.
- If a probe becomes stale, report `unknown` or a stale indicator in the UI rather than preserving an indefinitely green state.
- Draft engines remain `unknown` unless a separate development probe state is introduced.

## 5. Data and security constraints

- Use service-side probes; do not expose service credentials to the browser.
- Do not store raw secrets, user payloads, or biological observations in health metadata.
- Health probes must be idempotent, bounded, rate-limited, and side-effect free.
- Never enqueue fake production jobs simply to update health.
- Preserve organization scope for organization-specific engines.
- Keep probe output minimal: status, checked timestamp, probe version, latency, and sanitized failure code.

## 6. Implementation sequence

1. Add a worker startup self-test that validates the built-in handler map against active worker-mode registry rows.
2. Add a protected, minimal health route for Edge Functions; standardize response fields and authentication.
3. Add read-only health aggregation from probe results and recent runtime failures. Keep workload success rate separate from liveness.
4. Only add a persistence table if existing registry fields cannot represent probe history safely; do not overload `engine_registry.config`.
5. Add tests for stale probes, transient failures, recovery, draft engines, and provider outages before updating production health values.

**Decision:** keep all current engine health values as `unknown`. Implement probes first; never mark engines healthy by default.
