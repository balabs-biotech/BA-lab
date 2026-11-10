# BA Labs Environmental Execution Service v1

## Purpose

The execution service is the provider-neutral orchestration boundary for one
environmental analysis. It coordinates existing calculation modules and
returns a validated BAL-JSON v1 envelope.

It is not an API server, data collector, scheduler, database repository, or
authorization layer.

## Public entrypoint

Python import:

```python
from ba_environmental_engine import run_environmental_analysis
```

The service accepts:

- normalized environmental observations;
- analysis UUID and timezone-aware generation timestamp;
- engine version;
- organization/location scope dates (tenant and location identity are read
  from the normalized observations);
- latitude and altitude required by FAO-56 calculations;
- optional explicit rolling aggregation methods, windows, and minimum coverage.

It returns a validated `BALAnalysis` object. Callers can serialize it with
Pydantic's `model_dump(mode="json", by_alias=True)`.

## Execution sequence

1. Validate non-empty normalized input and requested date scope.
2. Group weather observations by observation date.
3. Calculate daily FAO-56 net radiation and reference ET0 independently for
   each date through the existing daily calculation module.
4. If rolling methods are explicitly supplied, construct variable/date series
   and calculate the requested windows using the existing coverage engine.
5. Reject duplicate variable/date observations for configured rolling
   variables; do not choose one source silently.
6. Pass observations and calculation results to the BAL-JSON serializer.
7. Return the schema-validated analysis envelope.

## Scientific and data-integrity rules

- No interpolation, gap filling, or silent outlier deletion.
- No implicit aggregation method selection. The caller must explicitly choose
  mean, sum, min, or max for each rolling variable.
- Canonical units and source coherence remain enforced by the calculation
  modules.
- Tenant/location consistency and observation lineage remain enforced by the
  serializer.
- Missing daily inputs remain explicit insufficient-data results.
- The service does not make external network requests or persist data.

## Isolation and failure behavior

The service is a single execution boundary, not yet a plugin runtime. A failure
in one calculation currently fails that analysis request; it does not mutate
source observations or persist partial output. Future independent indicator
families should be added behind separate calculation adapters and explicit
failure policies rather than broad exception suppression.

## Application integration boundary

A future FastAPI or Supabase-facing adapter may:
- authenticate the caller;
- authorize organization/location access;
- load normalized observations from a repository;
- call this service;
- persist the validated result and audit metadata;
- return the BAL-JSON response.

Those responsibilities must remain outside this package. The engine must never
receive Supabase service-role credentials or perform tenant authorization by
trusting caller-supplied UUIDs.
