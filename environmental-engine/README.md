# BA Labs Environmental Engine

Python calculation core for traceable environmental indicators used by CultureOps.

## Current milestone

The engine foundation provides:
- daily coverage assessment without interpolation;
- deterministic daily aggregation with explicit coverage thresholds;
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
python -m pip install -e ".[dev]"
pytest
```

Python 3.10+; CPU-only. See
`docs/architecture/ba-environmental-unit-registry-v1.md` for canonical units
and conversion conventions, and `docs/architecture/ba-nasa-power-adapter-v1.md`
for the provider mapping and daily time semantics, and
`docs/architecture/ba-environmental-quality-screening-v1.md` for screening rules, and
`docs/architecture/ba-environmental-temporal-screening-v1.md` for temporal anomaly semantics, and
`docs/architecture/ba-environmental-seasonal-reference-v1.md` for seasonal reference semantics, and
`docs/architecture/ba-vapor-pressure-deficit-v1.md` for the VPD formula and interpretation limits, and
`docs/architecture/ba-vpd-period-aggregation-v1.md` for period aggregation semantics, and
`docs/architecture/ba-environment-context-v1.md` for environment context identity and origin rules, and
`docs/architecture/ba-sensor-measurement-lineage-v1.md` for sensor and observation lineage. and
`docs/architecture/ba-fao56-reference-evapotranspiration-v1.md` for the daily FAO-56 ET0 contract. and
`docs/architecture/ba-fao56-net-radiation-v1.md` for daily solar and net-radiation calculations. and
`docs/architecture/ba-daily-reference-indicators-pipeline-v1.md` for the normalized source-to-indicator pipeline.
