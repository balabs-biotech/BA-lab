# Sentinel-2 ingestion worker v1

## Purpose

Move Sentinel-2 native-grid COG reading and NDVI statistics out of the Supabase Edge runtime while retaining Supabase as the authorization and persistence authority. The worker is a private, stateless processing service; it does not own a database credential.

## Runtime path

1. The CultureOps client calls `earth-search-sentinel2-run` with a location and bounded acquisition-date window.
2. The Edge Function validates the user's JWT, resolves the location under the caller's RLS context, and verifies the user's `owner`, `admin` or `member` role in the owning organization.
3. The gateway derives an approximate AOI from the saved location coordinates, queries Earth Search STAC over HTTPS, bounds pagination and selects at most 10 scenes.
4. It calls the private FastAPI worker with the caller JWT, the Supabase publishable `apikey` header required by the Functions gateway, and `X-BA-Engine-Key`.
5. The worker validates the request, processes each scene through the existing STAC parser, bounded COG reader, SCL mask, NDVI statistics calculator and observation payload builder.
6. The worker excludes incomplete or non-valid scene pairs, serializes the exact payload, and signs `<unix-seconds>.<raw-json-body>` with HMAC-SHA256.
7. The worker forwards the caller JWT plus timestamp/signature headers to `earth-search-sentinel2-ingest`.
8. The persistence Edge Function re-authenticates the user, verifies the timestamp and HMAC, re-checks location and organization writer membership, validates scene provenance and calls `upsert_satellite_environmental_observations(jsonb)`.

## Trust boundaries

| Component | Trust responsibility | Credentials |
|---|---|---|
| CultureOps client | User intent only; no service secrets | User Supabase session |
| `earth-search-sentinel2-run` | User authentication, location/organization resolution, writer authorization, STAC discovery and batch limits | Supabase publishable key; private worker API key |
| Private Python worker | COG processing, scientific quality filtering and HMAC signing | Private engine API key; worker HMAC secret; no Supabase service-role key |
| `earth-search-sentinel2-ingest` | Re-authentication, HMAC verification, tenant revalidation and persistence | Supabase server secret; worker HMAC secret |
| `environmental_observations` | Durable tenant-scoped source observations | RLS and database constraints |

The caller JWT is forwarded end-to-end. The worker does not trust organization or location IDs by themselves; the persistence boundary independently validates the location and writer membership before accepting any row.

## Limits and semantics

- Acquisition window: at most 90 calendar days.
- STAC scenes per run: at most 20.
- Python worker maximum: 100 scenes, although the gateway currently sends no more than 20.
- Raster pixel budget: at most 4,000,000 pixels per scene.
- Minimum valid-pixel ratio: 0.20.
- Persistence batch: at most 200 rows / 100 scene pairs.
- Only `quality_flag = valid` pairs are persisted.
- Each scene produces `ndvi_mean` and `ndvi_median`, with the same acquisition time, retrieval time, source URL and scene identity.
- The AOI is an approximate buffer around the saved location point. It must not be represented as a property boundary or parcel measurement.
- Scene failures are isolated by the batch processor. A scene failure does not abort the remaining scenes.
- Upserts are retry-safe through `source_record_id` and the satellite partial unique index. Because PostgREST's generic upsert cannot express the partial-index inference predicate, persistence uses a `SECURITY DEFINER` SQL RPC that supplies `WHERE data_family = 'satellite'` in the `ON CONFLICT` target. Execute permission is limited to `service_role`.

## Deployment configuration

### Supabase Edge Function: `earth-search-sentinel2-run`

- `BA_ENVIRONMENTAL_ENGINE_URL`: HTTPS base URL of the private worker service.
- `BA_ENVIRONMENTAL_ENGINE_API_KEY`: shared private service key used in `X-BA-Engine-Key`.

### Private worker

- `BA_ENVIRONMENTAL_ENGINE_API_KEY`: same value as the gateway secret.
- `BA_SENTINEL2_INGEST_URL`: full URL of `earth-search-sentinel2-ingest`.
- `BA_SENTINEL2_WORKER_SECRET`: at least 32 random bytes.

### Supabase Edge Function: `earth-search-sentinel2-ingest`

- `BA_SENTINEL2_WORKER_SECRET`: exactly the same secret configured in the private worker.
- Supabase server secret: provided by the Edge Function environment; never copied to the worker or client.

## Operational prerequisites

1. Build the private worker image from `environmental-engine/Dockerfile`.
2. Deploy it behind private ingress and set the engine API key.
3. Configure the Edge Function worker URL and matching API key.
4. Configure the shared HMAC secret on the worker and persistence Edge Function.
5. Apply and verify the source identity migration before first persistence.
6. Run Python, Edge Function contract and SQL migration tests.
7. Deploy the two Edge Functions only after explicit release approval.
8. Run one authorized test location/date window and verify both mean/median rows, source identity, provenance and retry idempotency.

No production deployment, secret configuration, migration application or satellite persistence is performed by this code change.


## Leased worker persistence boundary

The durable-worker path uses a separate server-to-server endpoint:
`earth-search-sentinel2-lease-ingest`. Its Python transport is
`execution/lease_ingest.py` and sends only `job_id`, `lease_token`,
tenant/location identifiers, and paired observation rows. It signs the exact
UTF-8 request bytes with HMAC-SHA256 and does not forward a user JWT or
publishable API key.

Lease validation and persistence are now one database transaction through
`persist_leased_satellite_environmental_observations(job_id, lease_token, rows)`.
The RPC locks the job row with `FOR UPDATE`, checks that the lease is current
and that job type/provider/dataset and row tenant/source scopes match, then
calls the existing satellite upsert RPC before releasing the lock. This closes
the previous read-then-upsert race in which a lease could expire or be reclaimed
after Edge Function validation but before the observation write.

This is still an implementation foundation, not an activated queue. The
authenticated synchronous gateway remains the active path until the queued
request gateway, worker processor composition, retry/reconciliation schedule,
integration tests, and deployment configuration are implemented and verified.


## Leased processor composition (implementation foundation)

- Added `LeasedSentinel2JobProcessor`: validates the claimed job contract and bounded date/cloud/scene parameters, resolves location coordinates within the job tenant, reconstructs the same approximate AOI used by the synchronous gateway, discovers scenes, processes the COGs, filters invalid NDVI pairs and submits rows through the lease-bound HMAC transport.
- Added a bounded Earth Search HTTP adapter with HTTPS host allowlisting, redirect rejection, request/response byte caps and GET/POST pagination support.
- Corrected a defect in the STAC search result ordering: the search previously attempted to sort (scene, item) tuples as though they were scenes. Results now sort by acquisition timestamp and scene ID, and retain the original STAC Features in the same order for raster processing.
- Added lease-loss cancellation checks between scenes and immediately before persistence. In-flight raster reads are not forcibly interrupted; the coordinator will refuse finalization if heartbeat ownership is lost.
- Added an explicit runtime factory that composes the service-role RPC adapter, tenant-scoped location reader, STAC HTTP client, lease processor and worker coordinator from private process environment variables. Importing the package does not start the worker.
- Added tests for processor composition, AOI bounds, cancellation, STAC HTTP transport and raw-item ordering. These tests have been added but not executed in this session.

The async path is still not ready for activation. The authenticated gateway has not yet been converted to enqueue-only behavior, the worker process has no deployment/supervision configuration, and end-to-end tests against a disposable Supabase project remain required.


## Dedicated worker process entrypoint

A graceful-stop CLI is now available as
`python -m ba_environmental_engine.execution.worker_main`. It builds the
private runtime from environment-injected service-role credentials, handles
SIGTERM/SIGINT, and drains the current job before stopping its poll loop.
The existing API Docker image already installs the `satellite` extra, so a
separate worker service can reuse that image with a command override. No worker
service has been deployed or started.


## Authenticated enqueue-only gateway

Added `supabase/functions/earth-search-sentinel2-enqueue` as a separate
future queue entrypoint. It authenticates the user JWT, verifies location
visibility and organization write membership, validates the same 90-day,
cloud-cover and 10-scene request bounds, and inserts a `queued` ledger row
containing only the bounded date/cloud/scene parameters and the approximate
AOI method. It does not call Earth Search, the raster worker, or the
synchronous endpoint, and it never stores the caller JWT.

The existing `earth-search-sentinel2-run` synchronous endpoint remains
unchanged and remains the current active path. The new enqueue endpoint is not
yet wired into CultureOps UI or deployed.
