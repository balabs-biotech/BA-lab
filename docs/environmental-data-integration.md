# Free/open environmental data integration

## Product objective

Add environmental context to a user's own locations and Agritech units without mixing external estimates with manual measurements or IoT readings. Every imported value must keep its provider, dataset, observation time, retrieval time, unit, spatial/temporal resolution, quality flags and source URL.

## Provider decisions

### Phase 1 — NASA POWER (historical agroclimate)

Use the public REST API first for daily historical agroclimate context. It requires latitude/longitude and does not require a user API key. It provides analysis-ready solar and meteorological variables, with daily history from 1981 to near-real-time. It is not a live weather-station feed or a short-term forecast. NASA documents meteorological source resolution around 0.5 x 0.625 degrees (roughly 50 km) and solar data around 1 degree (roughly 100 km); recent data may be revised as higher-quality products replace near-real-time data.

Start with daily variables selected from the NASA POWER parameter dictionary, including daily mean/min/max air temperature, precipitation, solar radiation and `ALLSKY_SFC_UV_INDEX` (mapped internally to `uv_index_daily_mean`). The UV variable is a daily estimate on a coarse solar grid; it must not be described as the instantaneous or midday maximum UV index. Confirm parameter names, units and community before mapping values into BA Labs' canonical variable/unit vocabulary. Store UTC timestamps or explicit source time standard, not an unlabelled local date.

Official docs:
- https://power.larc.nasa.gov/docs/services/api/
- https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- https://power.larc.nasa.gov/docs/faqs/data/

### Phase 2 — Sentinel-2 through Copernicus Data Space Ecosystem (satellite)

Use Sentinel-2 Level-2A surface reflectance to calculate a first vegetation index (NDVI) for a georeferenced field or a point/plot. The underlying Copernicus data is free and open, but API access, account authentication, processing quotas and monthly limits still apply. The theoretical revisit is not a guarantee of a usable observation: clouds, shadows, acquisition timing and processing availability must be reflected in quality metadata.

Prefer catalog discovery and on-demand processing over downloading full scenes. Keep acquisition date, product identifier, cloud percentage, pixel/aggregation method, spatial resolution and the processing algorithm/version. Do not present NDVI as a direct yield measurement or a substitute for ground observations.

Official docs:
- https://dataspace.copernicus.eu/analyse/apis
- https://documentation.dataspace.copernicus.eu/Quotas.html
- https://eu-space.europa.eu/copernicus-data-access

### Forecasts and commercial licensing

Do not build BA Labs' commercial service on Open-Meteo's no-cost API without obtaining permission/a suitable licence: its current free tier is explicitly non-commercial; commercial use requires a paid licence. Its underlying data being open does not automatically make that API service free for a commercial application. Reassess a commercial forecast provider or a self-hosted open-data model pipeline separately; self-hosting still has infrastructure and operations costs.

Reference:
- https://open-meteo.com/en/terms
- https://open-meteo.com/en/pricing

## Data model

- Coordinates belong to `locations`, not only to a plant record, because several units may share one site. Latitude/longitude are optional until a user explicitly enters or confirms a location. Never silently infer a precise farm coordinate from the user's browser location.
- `environmental_observations` stores imported numeric values independently from `measurements`. This keeps external gridded estimates distinct from manual measurements and IoT telemetry.
- The organization-scoped foreign key and row-level security bind every environmental record to a location owned by the same organization.
- Authenticated clients can read their own organization's data, but cannot insert or forge provider-sourced observations. Server-side ingestion is responsible for writes and deduplication.
- Keep source and quality metadata with each record. Re-fetching must be idempotent and must not overwrite manual/IoT records.

## Recommended user workflow

1. User selects an existing location and enters/validates its latitude and longitude (decimal degrees), with a visible source and accuracy note.
2. User chooses **Historical weather context**; the server fetches a bounded date range from NASA POWER and caches the response.
3. The interface labels the result as **gridded estimate**, shows provider and approximate resolution, and offers a date range.
4. Only after this works end-to-end, add a **Satellite vegetation index** workflow that lets a user specify the plot boundary or deliberately use a point/centroid.
5. Compare external context with the user's measurements/IoT series in a shared timeline, but preserve each series' provenance and do not merge them into one undifferentiated dataset.

## Operational constraints

- Cache per provider, dataset, location/grid cell and date; avoid repeated identical API requests.
- Use bounded backfills, retry with backoff, explicit timeouts and provider error states.
- Do not make the browser call providers directly for bulk imports. Use a server-side Edge Function with organization membership checks and a bounded request window.
- Do not expose service-role credentials in the static GitHub Pages client.
- Do not schedule automatic refresh until the deployment has a verified scheduler (e.g. Supabase Cron/pg_cron or an external GitHub Actions schedule) and its costs/limits are understood.
- Free data does not mean unlimited processing, guaranteed availability or zero operational cost.


## First implementation — NASA POWER daily import

The first connector is implemented as the Supabase Edge Function `nasa-power-agroclimate` and the Green Tech panel loaded by `batch-tracker/environmental-data.js`.

- A signed-in organization member selects an existing location and explicitly enters or confirms its latitude/longitude. The interface does not infer the user's precise location.
- The browser calls the Edge Function; it does not call NASA POWER directly or hold server credentials.
- The function validates the location through the caller's RLS-scoped session, accepts a maximum 366-day date window, calls NASA POWER's daily point endpoint and upserts values into `environmental_observations`.
- Imported variables: daily mean/minimum/maximum 2 m air temperature, corrected precipitation and all-sky surface shortwave radiation.
- Idempotency uses the organization/location/provider/dataset/variable/observation-time unique key. Recently retrieved complete-enough ranges may be served from the database cache; a subsequent manual refresh control can be added if operational testing shows it is needed.
- Each record retains the NASA parameter name, source date/time standard, coordinate provenance, source URL, retrieval time, unit and an indicative grid scale. Missing sentinel values are excluded.
- The panel labels these values as gridded estimates and does not turn them into diagnoses or irrigation commands.

Before production use, deploy the Edge Function with JWT verification enabled and test with a real organization location whose coordinates have been explicitly checked. Confirm read/update RLS policies on `locations` and read RLS on `environmental_observations`. Do not populate live data using invented coordinates or synthetic observations.


## Sentinel-2 ingestion architecture — persistence boundary

The Sentinel-2 pipeline is split into three trust zones:

1. **Catalogue and scene processing** — Earth Search STAC discovery plus the Python environmental engine. The Python engine validates STAC identity, reads bounded COG windows, applies the SCL quality mask, computes native-grid NDVI statistics and builds provider-provenanced observation rows. It does not hold database credentials.
2. **Authenticated orchestration** — a signed-in user invokes the ingestion workflow for a location. The caller's JWT is used to resolve the location under RLS and verify explicit membership in the owning organization.
3. **Persistence boundary** — the Edge Function `earth-search-sentinel2-ingest` accepts only a trusted worker's HMAC-SHA256-signed payload, checks a five-minute timestamp window, revalidates tenant scope and row provenance, then calls the service-role-only SQL RPC `upsert_satellite_environmental_observations(jsonb)`. This RPC supplies the partial-index predicate required for scene-aware idempotent upserts.

### Worker request contract

- Required server secret: `BA_SENTINEL2_WORKER_SECRET`. It must exist only in the Edge Function's secret store and the private worker environment; never in the browser or repository.
- Headers: the user's `Authorization: Bearer <JWT>`, `x-ba-worker-timestamp: <unix-seconds>`, and `x-ba-worker-signature: <hex-HMAC-SHA256>`.
- Signature input: UTF-8 bytes of `<unix-seconds>.<exact-raw-request-body>`, keyed with `BA_SENTINEL2_WORKER_SECRET`.
- Payload scope: `organization_id`, `location_id`, and `rows`. Every row must match the requested tenant/location and the Earth Search Sentinel-2 L2A source contract.
- Each scene must include exactly one `ndvi_mean` and one `ndvi_median` row, the same STAC scene ID in `source_record_id` and `metadata.scene_id`, canonical unit `1`, quality flag `valid`, a valid-pixel ratio of at least 0.2, cloud percentage and an Earth Search STAC item URL.
- Request size is capped at 256 KiB and one batch at 100 scenes / 200 observations. Upserts use the scene-aware unique key, so retries do not create duplicate observations.

### Current implementation boundary

The persistence Edge Function and its source-contract test have been added to the feature branch. The Python scene processor and payload builder already produce the corresponding data shape; the Edge Function validates the actual field names and units emitted by that builder.

**The private processing worker path is now implemented in code.** The authenticated `earth-search-sentinel2-run` gateway performs STAC discovery and tenant authorization, then calls the private FastAPI route `/v1/sentinel2/process-and-persist`. The Python worker processes bounded scenes and signs the exact payload; `earth-search-sentinel2-ingest` verifies that signature and re-checks the caller before persistence. A CPU-only container definition and deployment/secret contract are documented in `environmental-engine/docs/architecture/ba-sentinel2-ingestion-worker-v1.md`. The worker is not deployed, its secrets are not configured, neither Edge Function has been deployed, no satellite rows have been written, and no production migration has been applied. The existing `earth-search-sentinel2-ndvi-preview` remains display-only and is not a source of persisted scientific statistics. The six worker transport tests were executed in an isolated harness with the scene processor stubbed (6 passed). The FastAPI route tests, real raster-processing tests, Supabase Edge contract tests and SQL migration tests have not yet been executed. Do not enable production ingestion until the full focused suite passes and the source identity plus RPC migrations have been verified/applied with approval.


### Partial-index persistence compatibility

The source identity migration replaces the former global unique constraint with separate partial unique indexes for weather and satellite observations. PostgREST's generic `.upsert(onConflict=...)` cannot supply the partial-index predicate, so provider writes now use privileged SQL RPCs:

- `upsert_weather_environmental_observations(jsonb)` for both interactive and scheduled NASA POWER ingestion.
- `upsert_satellite_environmental_observations(jsonb)` for Sentinel-2 scene pairs.

Both functions are `SECURITY DEFINER`, validate their source-family contract, and grant execution only to `service_role`. This preserves weather idempotency while allowing multiple Sentinel-2 scenes with the same acquisition timestamp.


### Durable ingestion job ledger

Each Sentinel-2 processing attempt now creates a row in `public.environmental_ingestion_jobs` after STAC discovery and before the private raster worker is called. The row records the organization/location scope, requesting user, bounded search parameters, selected-scene count, lifecycle status, completion timestamp, and aggregate result counters.

- Status lifecycle: `processing` → `succeeded`, `partial_failed`, or `failed`.
- Worker connection failures and non-success HTTP responses are recorded with bounded error codes; no exception text, credentials, AOI payload, or signed asset URL is stored.
- `authenticated` users receive read-only access through organization-membership RLS. All writes are performed by the authenticated Edge gateway using its server-only `SUPABASE_SERVICE_ROLE_KEY`.
- CultureOps can query the table directly with the user's Supabase client to show recent jobs and refresh their status. It must filter by `location_id` and order by `created_at`; RLS remains the tenant boundary.
- Static Edge and SQL contract tests have been added for the job ledger but have not been executed in this environment. This is a durable execution ledger for the current synchronous worker call, not yet a background queue. A request timeout can leave a job in `processing` if the gateway itself is terminated before it can record the failure. A later worker-queue phase should add leases, heartbeat timestamps, and stale-job reconciliation.


## Sentinel-2 execution ledger and queue protocol

The Sentinel-2 gateway currently records a synchronous execution in `environmental_ingestion_jobs`. The ledger is visible to authenticated members of the owning organization through read-only RLS. The Green Tech history panel reads the latest 50 records and filters them by location.

### Lease protocol foundation (migration pending)

The follow-on migration `20261112210000_add_environmental_ingestion_job_leases.sql` adds the database primitives for a future worker queue:

- `queued` jobs become claimable when `available_at <= now()`.
- A claim is serialized with `FOR UPDATE SKIP LOCKED`, increments `attempt_count`, and issues a random opaque lease token.
- Lease duration is bounded to 30–900 seconds.
- A worker must heartbeat with the matching token before expiry; an expired or superseded worker cannot extend the lease or finalize the job.
- Finalization is accepted only for the current unexpired lease and a terminal status.
- Expired leased jobs can be reclaimed while attempts remain. The reconciliation RPC marks exhausted attempts as failed.
- Claim, heartbeat, completion and reconciliation RPCs are executable only by `service_role`.

This is a database protocol foundation, not yet an active asynchronous queue. The current gateway still creates and executes synchronous `processing` jobs; it does not enqueue work, and no worker polling/heartbeat loop or scheduled reconciler is deployed. The existing synchronous rows have no lease token and are deliberately excluded from queue reclamation.

Before queue activation, add a separate enqueue entry point, a worker poll loop with heartbeat cancellation, idempotent result finalization, a scheduled stale-job reconciler, and operational limits/metrics. Validate the migration against a disposable Supabase database and exercise concurrent claims and expired-token races before applying it to production.
