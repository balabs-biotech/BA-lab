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
- trailing robust temporal anomaly screening with explicit insufficient-history and zero-MAD states;
- seasonal historical reference screening that compares only with prior years;
- a traceable air vapor-pressure deficit (VPD) calculation from temperature and relative humidity;
- FAO-56 daily net radiation (Ra, Rso, Rns, Rnl, Rn) with solar-geometry and cloudiness diagnostics;
- FAO-56 daily reference grass evapotranspiration (ET0), with explicit pressure/altitude and vapour-pressure inputs;
- a provider-neutral daily pipeline joining normalized weather observations to net radiation and ET0 with source-ID lineage and explicit missing-data states;
- period-level VPD summaries with explicit above-threshold duration and sampling-gap exclusions;
- versioned environment context metadata separating outdoor, greenhouse, fruiting-chamber and laboratory observations;
- sensor descriptors and measurement contracts with source-observation and formula lineage.

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
python -m pip install -e ".[dev,api]"
pytest

# Start the private API locally (requires BA_ENVIRONMENTAL_ENGINE_API_KEY)
uvicorn ba_environmental_engine.api.app:app --host 127.0.0.1 --port 8000
```

Python 3.10+; CPU-only.

## Private service API

The optional FastAPI boundary exposes `GET /health` and `POST /v1/analyses`. Configure `BA_ENVIRONMENTAL_ENGINE_API_KEY` in the runtime secret manager before starting the service. Keep the API behind private ingress; never expose the internal key to CultureOps clients. The Supabase Edge Function must authenticate the user and enforce organization/location authorization before forwarding normalized observations.

## Architecture contracts

- `docs/architecture/ba-environmental-execution-service-v1.md`: execution service entrypoint, orchestration sequence, scientific boundaries and application integration responsibilities.
- `docs/architecture/ba-environmental-private-api-v1.md`: private FastAPI boundary, service authentication, tenant trust boundary and synchronous request/response contract.
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
- `docs/architecture/ba-fao56-reference-evapotranspiration-v1.md`: daily FAO-56 ET0 contract.
- `docs/architecture/ba-fao56-net-radiation-v1.md`: daily solar and net-radiation calculations.
- `docs/architecture/ba-daily-reference-indicators-pipeline-v1.md`: normalized source-to-indicator pipeline.
