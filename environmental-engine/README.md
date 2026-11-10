# BA Labs Environmental Engine

Python calculation core for traceable environmental indicators used by CultureOps.

## Current milestone

The engine foundation provides:
- daily coverage assessment without interpolation;
- deterministic daily aggregation with explicit coverage thresholds;
- BAL-JSON v1 schema validation;
- explicit climate-variable unit normalization with original-unit provenance;
- variable-specific plausibility screening that flags suspect values without modifying them.

Derived values remain distinct from source observations. The engine does not
write calculated values back as sensor measurements. A strict NASA POWER daily-row
adapter maps the versioned provider parameters to canonical variables while
preserving source-row identity, original units, timestamps and quality flags.

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
`docs/architecture/ba-environmental-quality-screening-v1.md` for screening rules.
