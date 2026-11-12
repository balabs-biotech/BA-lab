# Sentinel-2 ingestion worker v1

## Purpose

Move Sentinel-2 native-grid COG reading and NDVI statistics out of the Supabase Edge runtime while retaining Supabase as the authorization and persistence authority. The worker is a private, stateless processing service; it does not own a database credential.

## Runtime path

1. The CultureOps client calls `earth-search-sentinel2-run` with a location and bounded acquisition-date window.
2. The Edge Function validates the user's JWT, resolves the location under the caller's RLS context, and verifies the user's `owner`, `admin` or `member` role in the owning organization.
3. The gateway derives an approximate AOI from the saved location coordinates, queries Earth Search STAC over HTTPS, bounds pagination and selects at most 10 scenes.
4. It calls the private FastAPI worker with both the caller JWT and `X-BA-Engine-Key`.
5. The worker validates the request, processes each scene through the existing STAC parser, bounded COG reader, SCL mask, NDVI statistics calculator and observation payload builder.
6. The worker excludes incomplete or non-valid scene pairs, serializes the exact payload, and signs `<unix-seconds>.<raw-json-body>` with HMAC-SHA256.
7. The worker forwards the caller JWT plus timestamp/signature headers to `earth-search-sentinel2-ingest`.
8. The persistence Edge Function re-authenticates the user, verifies the timestamp and HMAC, re-checks location and organization writer membership, validates scene provenance and upserts using the scene-aware idempotency key.

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
- Upserts are retry-safe through `source_record_id` and the satellite partial unique index.

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
