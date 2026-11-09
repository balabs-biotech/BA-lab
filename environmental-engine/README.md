# BA Labs Environmental Engine

Python calculation core for traceable environmental indicators used by CultureOps.

## Current milestone

The first implementation slice establishes daily time-series coverage assessment.
It deliberately does not interpolate missing observations or write derived values
back as sensor measurements.

## Setup

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -e ".[dev]"
pytest
```

Python 3.10+; CPU-only.
