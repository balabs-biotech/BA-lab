# BA Environmental Intelligence Engine — contract v1

**Status:** foundation specification  
**Scope:** first Python engine milestone (Climate MVP)  
**Compatibility:** existing CultureOps / Supabase environmental observations  
**Owner:** BA Labs

## 1. Purpose and boundary

The engine converts traceable environmental observations into reproducible, quality-qualified indicators. It is an independent Python package and private service; it does not own user identity, organization membership, location permissions, or the source-of-truth observation store.

- Supabase/PostgreSQL remains the operational source of truth.
- Supabase Edge Functions remain responsible for authenticated acquisition and orchestration.
- The engine reads a bounded, authorized input set and returns derived results.
- CultureOps remains the user interface and decision-support surface.
- No engine output may be written into `measurements` as if it were a sensor reading.
- No automatic irrigation, actuator command, agronomic diagnosis, or causal claim is in scope.

## 2. Existing input contract

The first adapter reads rows from `environmental_observations`. Existing columns are:

| Field | Meaning |
|---|---|
| `organization_id`, `location_id` | tenant and location scope |
| `data_family` | `weather` or `satellite` |
| `provider_code`, `dataset_code` | provider and dataset identity |
| `variable_code` | canonical variable identifier |
| `value`, `unit_code` | numeric observation and unit |
| `observed_at`, `retrieved_at` | observation and retrieval timestamps |
| `spatial_resolution_m` | indicative spatial resolution, nullable |
| `quality_flag` | source quality classification |
| `source_url`, `metadata` | provenance and provider-specific context |

Input invariants:

1. Never combine observations from different organizations or locations in one calculation.
2. Preserve source rows and their original values; normalization is an in-memory transformation.
3. Reject non-finite numeric values and unknown unit conversions; do not silently coerce.
4. Keep observation time distinct from retrieval time.
5. Treat NASA POWER values as gridded estimates, not local station measurements.
6. Missing dates remain missing. Do not interpolate or fabricate source observations in Climate MVP v1.
7. A derived indicator must disclose the exact input variable set, period, and coverage.

## 3. Canonical BAL-JSON output envelope

The service returns one JSON document per analysis request:

```json
{
  "contract_version": "1.0.0",
  "engine": {
    "name": "ba-environmental-intelligence",
    "version": "0.1.0"
  },
  "analysis_id": "uuid",
  "generated_at": "2026-11-09T12:00:00Z",
  "scope": {
    "organization_id": "uuid",
    "location_id": "uuid",
    "from": "2026-10-01",
    "to": "2026-10-31"
  },
  "source_summary": [],
  "indicators": [],
  "warnings": []
}
```

### Source summary

Each entry identifies one source/dataset contributing to the analysis:

- `provider_code`, `dataset_code`, `data_family`
- `variables`: canonical variable codes actually consumed
- `observations_count`
- `observed_from`, `observed_to`
- `latest_retrieved_at`
- `quality_class`: `measured`, `gridded_estimate`, `satellite_derived`, or `mixed`
- `spatial_resolution_m` when known
- `source_urls`

### Indicator

Every indicator uses this shape:

```json
{
  "code": "precipitation_sum_7d",
  "label": "7-day precipitation total",
  "value": 18.4,
  "unit": "mm",
  "period": {
    "from": "2026-10-25",
    "to": "2026-10-31",
    "aggregation": "rolling_7d"
  },
  "status": "available",
  "coverage": {
    "expected": 7,
    "observed": 7,
    "ratio": 1.0
  },
  "quality": {
    "class": "gridded_estimate",
    "flags": []
  },
  "method": {
    "name": "sum",
    "version": "1"
  },
  "inputs": [
    {
      "variable_code": "precipitation_corrected",
      "unit": "mm/day"
    }
  ]
}
```

Allowed indicator statuses: `available`, `insufficient_data`, `not_applicable`, `invalid_input`. A missing result is represented by `value: null` and a status/reason, never by zero.

Quality flags are additive, machine-readable codes, initially:
- `LOW_COVERAGE`
- `STALE_SOURCE`
- `GRIDDed_ESTIMATE` (canonical spelling to be finalized in implementation as `GRIDDED_ESTIMATE`)
- `MIXED_PROVENANCE`
- `UNIT_CONVERSION`
- `OUTLIER_REVIEW_REQUIRED`
- `INSUFFICIENT_BASELINE`

The output must include no user names, emails, secrets, exact coordinates, or free-text private notes.

## 4. Climate MVP v1 indicator set

The first release is deliberately descriptive, not predictive.

| Indicator code | Definition | Required inputs | Minimum coverage |
|---|---|---|---|
| `air_temperature_mean_7d` | arithmetic mean of daily mean temperature | `air_temperature_mean` | 6/7 days |
| `air_temperature_max_7d` | maximum daily maximum over window | `air_temperature_max` | 6/7 days |
| `air_temperature_min_7d` | minimum daily minimum over window | `air_temperature_min` | 6/7 days |
| `precipitation_sum_7d` | sum of daily precipitation | `precipitation_corrected` | 6/7 days |
| `relative_humidity_mean_7d` | arithmetic mean of daily mean RH | `relative_humidity_mean` | 6/7 days |
| `wind_speed_mean_7d` | arithmetic mean of daily mean wind speed | `wind_speed_mean` | 6/7 days |
| `solar_radiation_sum_7d` | sum of daily global solar radiation | `solar_radiation_all_sky` | 6/7 days |
| `reference_et0_fao56_7d` | sum of daily reference evapotranspiration, FAO-56 Penman–Monteith | temperature, RH, wind, solar radiation; elevation/pressure input | all required daily inputs present |

The rolling window is defined in UTC calendar dates. The engine must not silently substitute another variable or provider when an input is absent. ET0 is unavailable when required inputs or elevation/pressure are missing; its method and assumptions must be explicit.

Anomaly indicators are not part of the first calculation slice. They require a documented climatological baseline, minimum baseline length, and a comparison method before implementation.

## 5. Quality and reproducibility rules

- Normalize units before calculation and retain original source units in provenance.
- Use deterministic calculations: same input rows, configuration, and engine version produce the same indicator values.
- Record algorithm/method version per indicator.
- Use explicit decimal precision and UTC timestamps in serialization.
- Report expected versus observed counts and coverage ratios.
- Do not use a low-coverage value as if it were a complete window.
- Do not label an estimate as a measurement.
- Do not infer parcel-scale precision from a coarse gridded provider.
- Preserve warnings when a calculation is omitted.

## 6. Service/API boundary

Initial service shape (private network only):

- `GET /health`: liveness and engine version; no tenant data.
- `POST /v1/analyze/climate`: accepts an authorized, bounded observation payload and analysis configuration; returns BAL-JSON.
- Request size and date-window limits are enforced at the service boundary.
- The caller is responsible for authentication and authorization; the engine must not accept arbitrary organization IDs as proof of access.
- No public unauthenticated endpoint and no direct browser-to-engine call.

The exact transport authentication mechanism is an implementation decision for deployment, but must be service-to-service and must not expose a privileged key in the browser.

## 7. Delivery sequence

1. Create a reproducible Python 3.10+ package and pinned development/test dependencies.
2. Implement BAL-JSON models/schema and validation tests.
3. Implement observation parsing, unit normalization, and data-quality/coverage evaluation.
4. Implement rolling descriptive indicators.
5. Implement and test FAO-56 ET0 only after the required inputs and elevation handling are explicit.
6. Add FastAPI only after the calculation core is independently testable.
7. Connect the private service to Supabase through a narrowly scoped caller; keep existing Edge Functions and UI unchanged until end-to-end tests pass.

## 8. Acceptance criteria for the first milestone

- The Python package installs reproducibly on CPU-only Linux and Python 3.10+.
- Contract validation rejects malformed scope, unsupported contract versions, non-finite values, and invalid indicator statuses.
- Unit conversion is explicit and tested.
- Missing source days are reflected in coverage; no silent imputation occurs.
- A known fixture produces stable 7-day indicator values.
- A low-coverage fixture returns `insufficient_data`, not a plausible-looking number.
- ET0 is not emitted as available without all required meteorological inputs and elevation/pressure.
- Existing Supabase schema, Edge Functions, and CultureOps frontend are not modified in this milestone.
