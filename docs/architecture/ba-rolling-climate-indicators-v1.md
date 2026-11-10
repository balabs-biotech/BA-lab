# Rolling climate indicators v1

## Purpose

Provide deterministic descriptive summaries over trailing 7, 14, 30 and 90
calendar-day windows. This module complements (and does not replace) daily
FAO-56 reference indicators, VPD calculations, temporal screening or seasonal
reference analysis.

## Calculation contract

`calculate_rolling_climate_indicators` accepts:

- a mapping of canonical variable codes to daily date/value mappings;
- an explicit inclusive `end_date`;
- one aggregation method per variable (`mean`, `sum`, `min` or `max`);
- an ordered set of unique positive window lengths (defaults: 7, 14, 30, 90);
- an explicit minimum coverage ratio (defaults to 1.0);
- optional canonical units per variable.

Each period is calculated as:

`period_start = end_date - (window_days - 1)`

Both period boundaries are included. The implementation delegates the
calculation and coverage accounting to the existing daily aggregation module.
It does not duplicate the coverage algorithm.

## Missing data and quality

- No interpolation, imputation, carry-forward or synthetic zero is performed.
- Coverage is calculated independently for every variable and window.
- A window below the configured coverage threshold returns
  `status=insufficient_data` and `value=null`.
- The default threshold is 100%, which is appropriate when reporting totals
  such as precipitation. A caller may explicitly select a lower threshold for
  descriptive sample statistics, but must expose the observed/expected count
  and must not present a partial precipitation sum as a complete period total.
- Non-finite values and non-date keys are rejected by validation and the
  underlying daily aggregation contract.

## Scientific interpretation

The engine deliberately does not hard-code a single aggregation method for a
variable catalogue. The caller must select methods according to variable
semantics. Examples:

| Variable | Typical descriptive method | Interpretation |
|---|---|---|
| `air_temperature_mean` | `mean` | Mean of daily mean temperatures |
| `air_temperature_max` | `max` | Highest daily maximum in the window |
| `air_temperature_min` | `min` | Lowest daily minimum in the window |
| `precipitation_corrected` | `sum` | Accumulated precipitation, only with adequate coverage |
| `solar_radiation_all_sky` | `mean` or `sum` | Mean daily irradiation or accumulated irradiation; label accordingly |

These are descriptive statistics, not crop-specific thresholds, causal
diagnoses, or agronomic prescriptions.

## Output

Each `ClimateWindowIndicator` contains the variable code, window length,
inclusive start/end dates and the existing `DailyAggregation` object,
including value, unit, status, method and full daily coverage report.

The caller remains responsible for attaching source observation IDs, source
snapshot/fingerprint, quality-screening decisions, location/environment
context and engine execution metadata to persisted analysis records. Derived
window summaries must not overwrite source observations.

## Boundaries

This is a pure Python calculation module. It does not fetch NASA POWER or
Sentinel-2 data, query Supabase, persist results, infer missing observations,
or call an AI provider. Provider acquisition, quality screening, provenance
and persistence remain separate layers.
