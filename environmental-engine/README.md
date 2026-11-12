# BA Labs Environmental Engine

Python calculation core for traceable environmental indicators used by CultureOps.

## Current milestone

The engine foundation provides:
- a provider-neutral execution service exposed as `run_environmental_analysis`, coordinating daily FAO-56 calculations, optional explicitly configured rolling windows, and validated BAL-JSON output;
- daily coverage assessment without interpolation;
- deterministic daily aggregation with explicit coverage thresholds;
- rolling 7/14/30/90-day descriptive climate indicators with per-variable coverage;
- BAL-JSON v1 schema validation;
- explicit climate-variable unit normalization with original-unit provenance;
- variable-specific plausibility screening that flags suspect values without modifying them;
- trailing robust temporal anomaly screening with calendar-window coverage, explicit insufficient-history and zero-MAD states; the execution service now serializes its results as provenance-checked BAL-JSON findings by variable;
- seasonal historical reference screening that compares only with prior years;
- a traceable air vapor-pressure deficit (VPD) calculation from temperature and relative humidity;
- FAO-56 daily net radiation (Ra, Rso, Rns, Rnl, Rn) with solar-geometry and cloudiness diagnostics;
- FAO-56 daily reference grass evapotranspiration (ET0), with explicit pressure/altitude and vapour-pressure inputs;
- a provider-neutral daily pipeline joining normalized weather observations to net radiation and ET0 with source-ID lineage and explicit missing-data states;
- period-level VPD summaries with explicit above-threshold duration and sampling-gap exclusions;
- versioned environment context metadata separating outdoor, greenhouse, fruiting-chamber and laboratory observations;
- sensor descriptors and measurement contracts with source-observation and formula lineage;
- opt-in instrument-health diagnostics for exact repeated-reading runs, isolated from biological interpretation;
- a configurable domain-interpretation layer routing traceable findings to Mycology, GreenTech or Lab profiles, with explicit context tags, biological subject/environment binding and no implicit biological thresholds or recommendations;
- biological subject and cultivation-context contracts binding organism, strain/cultivar, stage, substrate and production system to a tenant-scoped environmental context and analysis period;
- a separate biological BAL envelope serializing performance indicators with subject identity, formula/version, period, accepted and excluded measurement lineage, and explicit insufficient-evidence states.

Derived values remain distinct from source observations. The engine does not
write calculated values back as sensor measurements. A strict NASA POWER daily-row
adapter maps the versioned provider parameters to canonical variables while
preserving source-row identity, original units, timestamps, quality flags, spatial
resolution and provider metadata. Provider adapters return the shared
`NormalizedEnvironmentalObservation` contract in `sources/models.py`.

## Setup

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -e ".[dev,api,satellite]"
pytest

# Start the private API locally (requires BA_ENVIRONMENTAL_ENGINE_API_KEY)
uvicorn ba_environmental_engine.api.app:app --host 127.0.0.1 --port 8000
```

Python 3.10+; CPU-only.

## Private service API

The optional FastAPI boundary exposes `GET /health`, `POST /v1/analyses` for trusted normalized observations, `POST /v1/analyses/nasa-power` for strict normalization of persisted NASA POWER rows, and `POST /v1/analyses/biological-performance` for tenant-scoped biological measurement analysis and BAL biological serialization, and `POST /v1/sentinel2/process-and-persist` for bounded Sentinel-2 scene processing and signed persistence. Configure `BA_ENVIRONMENTAL_ENGINE_API_KEY` in the runtime secret manager before starting the service. Keep the API behind private ingress; never expose the internal key to CultureOps clients. The `environmental-analysis` Supabase Edge Function is the authenticated CultureOps gateway and reads authorized persisted rows before calling the engine. The Supabase Edge Function must authenticate the user and enforce organization/location authorization before forwarding normalized observations.

## Architecture contracts

- `docs/architecture/ba-environmental-execution-service-v1.md`: execution service entrypoint, orchestration sequence, scientific boundaries and application integration responsibilities.
- `docs/architecture/ba-domain-interpretation-framework-v1.md`: configurable domain profiles, biological context binding, context-tag matching, traceable signals and biological validation boundaries.
- `docs/architecture/ba-environmental-private-api-v1.md`: private FastAPI boundary, service authentication, tenant trust boundary and synchronous request/response contract.
- `docs/architecture/ba-biological-bal-envelope-v1.md`: biological performance envelope kept separate from the location-scoped environmental BAL-JSON analysis.
- `docs/architecture/ba-environmental-intelligence-contract-v1.md`: engine boundaries and data flow.
- `docs/architecture/ba-environmental-unit-registry-v1.md`: canonical units and conversion conventions.
- `docs/architecture/ba-nasa-power-adapter-v1.md`: provider mapping and daily time semantics.
- `docs/architecture/ba-environmental-quality-screening-v1.md`: plausibility and quality screening.
- `docs/architecture/ba-environmental-temporal-screening-v1.md`: temporal anomaly semantics.
- `docs/architecture/ba-environmental-seasonal-reference-v1.md`: seasonal reference semantics.
- `docs/architecture/ba-vapor-pressure-deficit-v1.md`: VPD formula and interpretation limits.
- `docs/architecture/ba-vpd-period-aggregation-v1.md`: VPD period aggregation semantics.
- `docs/architecture/ba-rolling-climate-indicators-v1.md`: rolling climate windows and coverage semantics.
- `docs/architecture/ba-environment-context-v1.md`: environment context identity and origin rules.
- `docs/architecture/ba-sensor-measurement-lineage-v1.md`: sensor and observation lineage.
- `docs/architecture/ba-sensor-instrument-health-v1.md`: opt-in flatline-candidate semantics, configuration and interpretation limits.
- `docs/architecture/ba-sensor-domain-signal-evidence-v1.md`: descriptive evidence carried by profile-routed sensor signals.
- `docs/architecture/ba-biological-recommendation-resolution-v1.md`: fail-closed, human-reviewed recommendation proposals resolved from versioned domain signals.
- `docs/architecture/ba-biological-recommendation-persistence-v1.md`: tenant-scoped persistence, append-only review events, authorization and optimistic concurrency.
- `interpretation/recommendation_service.py`: application orchestration for human-reviewed recommendation transitions; the repository adapter remains responsible for database authorization, atomic compare-and-swap and durable event history.
- `interpretation/supabase_recommendation_repository.py`: Supabase RPC/read adapter; proposal creation uses the trusted service client, while human transitions use the authenticated user client and database-derived actor identity.
- `docs/architecture/ba-fao56-reference-evapotranspiration-v1.md`: daily FAO-56 ET0 contract.
- `docs/architecture/ba-fao56-net-radiation-v1.md`: daily solar and net-radiation calculations.
- `docs/architecture/ba-daily-reference-indicators-pipeline-v1.md`: normalized source-to-indicator pipeline.


### Sentinel-2 private worker

The Sentinel-2 worker is a private service, not a browser API. Build it from this directory with `Dockerfile`; the image installs the optional `satellite` extra (Rasterio) and runs the existing FastAPI service. The authenticated Supabase gateway `earth-search-sentinel2-run` resolves the caller's location and writer membership, searches Earth Search STAC, then forwards the bounded scene batch and the caller JWT to this worker.

Required worker runtime secrets:

- `BA_ENVIRONMENTAL_ENGINE_API_KEY`: private gateway-to-worker key. The same value is configured in the Supabase Edge Function `earth-search-sentinel2-run` as `BA_ENVIRONMENTAL_ENGINE_API_KEY`.
- `BA_SENTINEL2_INGEST_URL`: full URL of the `earth-search-sentinel2-ingest` Supabase Edge Function.
- `BA_SENTINEL2_WORKER_SECRET`: at least 32 random bytes, shared only between this worker and the persistence Edge Function.

The persistence Edge Function also requires the same `BA_SENTINEL2_WORKER_SECRET`; it uses the caller JWT to re-check user identity, location scope and writer membership before using its server-only Supabase secret to upsert rows. The worker has no service-role key and cannot bypass that authorization boundary.

The gateway currently derives an **approximate location buffer** from the saved latitude/longitude; it is not a cadastral or surveyed parcel polygon. It limits a request to 90 days and 20 scenes. Each scene is processed independently; only complete, valid mean/median NDVI pairs are submitted. The worker does not create or modify migrations, deploy functions, or configure secrets automatically.

Do not expose the worker publicly without its private ingress controls and `X-BA-Engine-Key` authentication. Configure all three services and execute the focused tests before enabling production ingestion.
