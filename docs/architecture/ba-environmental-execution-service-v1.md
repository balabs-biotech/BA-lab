# BA Labs Environmental Execution Service v1

## Purpose

The execution service is the provider-neutral orchestration boundary for one
environmental analysis. It coordinates daily FAO-56 calculations, optional
rolling climate summaries and univariate temporal anomaly screening, then
returns a validated BAL-JSON v1 envelope.

It is not an API server, data collector, scheduler, database repository, or
authorization layer.

## Public entrypoint

Python import:

```python
from ba_environmental_engine import run_environmental_analysis
```

The service accepts normalized environmental observations, an analysis UUID,
timezone-aware generation timestamp, engine version, date scope, latitude and
altitude. Optional rolling aggregation methods, windows and coverage can be
provided. Temporal screening defaults to all weather variables and can be
restricted with `temporal_variables`; pass an empty tuple to disable it.
Window, minimum history, calendar coverage and robust-score threshold are
configurable.

It returns a validated `BALAnalysis` object. Callers can serialize it with
Pydantic's `model_dump(mode="json", by_alias=True)`.

## Execution sequence

1. Validate normalized input and requested date scope.
2. Group weather observations by observation date and calculate daily FAO-56
   net radiation and reference ET0.
3. Build one ordered daily series per weather variable, enforcing one value
   per variable/date and one canonical unit per variable.
4. Run the robust calendar-window temporal screen independently for each
   selected variable.
5. Convert each assessment into a versioned BAL-JSON finding with deterministic
   finding ID and exact source-observation lineage.
6. If rolling methods are explicitly supplied, calculate requested windows
   using the existing coverage engine.
7. Validate indicators, findings, provenance and source summaries in BAL-JSON.

## Scientific and data-integrity rules

- No interpolation, gap filling, or silent outlier deletion.
- No implicit rolling aggregation method selection.
- Temporal screening is univariate; variables and units are never pooled.
- Current observations are excluded from their own historical baseline.
- Insufficient history, insufficient calendar coverage and zero-MAD baselines
  remain explicit statuses, not fabricated normal/anomalous conclusions.
- Each finding must reference source observations matching its date, variable,
  unit and value.
- A finding is a statistical signal, not a biological diagnosis or
  recommendation.
- Tenant/location consistency and observation lineage remain enforced by the
  serializer.
- Missing daily FAO-56 inputs remain explicit insufficient-data results.
- The service does not make external network requests or persist data.

## Isolation and failure behavior

The service is a single execution boundary, not yet a plugin runtime. A failure
in a calculation currently fails that analysis request; it does not mutate
source observations or persist partial output. Future independent indicator
families should be added behind separate calculation adapters and explicit
failure policies rather than broad exception suppression.

## Application integration boundary

A future FastAPI or Supabase-facing adapter may authenticate the caller,
authorize organization/location access, load normalized observations, call
this service, persist the validated result and audit metadata, and return
BAL-JSON. Those responsibilities remain outside this package. The engine must
never receive Supabase service-role credentials or trust caller-supplied UUIDs
as proof of tenant authorization.
