# BA Labs Environmental Engine — Private API v1

## Purpose

Expose the provider-neutral calculation service to trusted application infrastructure without moving scientific calculations into Supabase Edge Functions or the CultureOps frontend.

## Trust boundary

The FastAPI service is a private service-to-service boundary. It accepts requests only when the caller supplies the configured X-BA-Engine-Key secret. The key must be stored as a deployment secret and must never be exposed to browsers, mobile clients, logs, or repository files.

Supabase Edge Functions remain the public application gateway. Before forwarding a request, the Edge Function must:

1. Validate the user's Supabase access token.
2. Resolve the user's organization membership and role using server-side authorization.
3. Verify that the requested location belongs to the authorized organization.
4. Construct the internal request from authorized records, not trust tenant identifiers supplied by the client.
5. Call the engine over a private network or authenticated service channel and attach the internal engine key.
6. Return the engine's BAL-JSON result only to the authorized caller.

The Python engine does not validate end-user JWTs and does not connect to Supabase. The internal key authenticates the service caller; it is not a substitute for per-user tenant authorization in the Edge Function.

## Endpoint

### GET /health

Returns a minimal liveness response. It does not expose configuration or secrets.

### POST /v1/analyses

Header: X-BA-Engine-Key: <deployment secret>

Request fields:

- analysis_id: caller-generated UUID used as the stable execution identifier.
- scope: organization, location and inclusive date range.
- latitude_deg, altitude_m: explicit site parameters required by FAO-56.
- observations: normalized source observations with source IDs and provenance.
- rolling_methods: optional explicit aggregation policy by variable.
- rolling_windows: optional inclusive calendar-day windows; defaults to 7, 14, 30 and 90.
- minimum_rolling_coverage: explicit coverage threshold; defaults to complete coverage.

The API rejects cross-organization/location observations, dates outside the declared scope, timezone-naive timestamps, unknown fields, and invalid rolling configuration. Request size is bounded to 5,000 observations at the schema layer; deployment ingress should also enforce a byte-size limit and request timeout.

Success returns a validated BAL-JSON v1 analysis envelope. Invalid requests return 422, invalid credentials return 401, and a missing server-side secret returns 503. The service does not persist results or create a background queue in this milestone.

### `POST /v1/analyses/nasa-power`

This provider-specific ingestion boundary accepts persisted `environmental_observations` rows using the database column names (`id`, `unit_code`, `metadata`, and so on). It passes each row through the Python `normalize_nasa_power_observation` adapter before execution. The adapter validates the provider, dataset, parameter-to-variable mapping, original unit, source date, timestamp semantics and source identifiers, then converts to canonical units while retaining source provenance. This lets Supabase remain a transport and authorization gateway instead of duplicating scientific normalization in TypeScript.

## Execution model

The first API version is synchronous and stateless. analysis_id is the execution identifier, and the HTTP response is the result. This is intentional: the current calculations are bounded CPU work, while a durable job queue would introduce storage, retries, cancellation and lifecycle semantics that are not yet required.

If later satellite processing or multi-location jobs exceed the synchronous request budget, introduce a separate job resource with explicit states (queued, running, succeeded, failed, cancelled), persisted input reference, retry policy and result reference. Do not simulate those states in an in-memory process.

## Operational requirements

- Deploy only behind private ingress or a service-to-service gateway.
- Store BA_ENVIRONMENTAL_ENGINE_API_KEY in the deployment secret manager.
- Rotate the key without committing it to source control.
- Disable interactive API documentation in production.
- Enforce request-body size, concurrency and timeout limits at ingress.
- Log correlation IDs, duration and error class; do not log the internal key or raw observation payloads.
- Keep persistence, authorization, scheduling and provider network access outside the scientific calculation package.
