# Daily FAO-56 reference-indicator pipeline v1

## Purpose

Compose the provider-neutral normalized weather observations into one daily FAO-56 net-radiation and reference ET0 result. This is the first end-to-end scientific calculation path from normalized source rows to derived indicators.

The pipeline is pure Python. It does not query Supabase, call NASA POWER, persist results, or invoke a generative model.

## Required normalized variables

One daily dataset must contain exactly one observation for each required variable:

| Variable code | Canonical unit | Role |
|---|---|---|
| `air_temperature_mean` | `degC` | Mean temperature in ET0 |
| `air_temperature_max` | `degC` | Saturation vapour pressure and longwave radiation |
| `air_temperature_min` | `degC` | Saturation vapour pressure and longwave radiation |
| `wind_speed_mean` | `m/s` | Wind speed at 2 m for ET0 |
| `solar_radiation_all_sky` | `MJ/m2` | Incoming shortwave radiation |
| `relative_humidity_mean` | `%` | Actual vapour pressure using FAO-56 mean-RH method |

The station latitude and altitude are explicit arguments, not inferred from a coarse location or provider centroid.

## Source coherence and validation

All input rows must share:
- organization ID and location ID;
- observed date;
- provider and dataset;
- provider time standard;
- weather data family.

Each row must have a timezone-aware timestamp whose calendar date matches its observed date. Required variable duplicates, non-canonical units, non-finite values, mixed source identity and invalid station coordinates are rejected.

Extra weather variables may be present but are not consumed by this indicator pipeline. Their own calculations remain separate modules.

## Quality-screening boundary

The pipeline validates schema, identity, units and numerical domains. It does not interpret provider-specific quality flags or replace the Environmental Engine quality-screening modules. The caller must apply the configured plausibility/quality policy before submitting observations; source flags and original observations remain preserved for audit.

## Missing data

If one or more required variables are absent, the pipeline returns `status=insufficient_data`, lists the missing variable codes and preserves the IDs of available required inputs. No interpolation, imputation, synthetic defaults or partial ET0 calculation occurs.

Duplicate variables are not resolved by choosing the newest or highest value. They are rejected for upstream reconciliation.

## Calculation sequence

1. Derive daily actual vapour pressure from mean RH and the mean saturation vapour pressure at Tmax/Tmin (FAO-56 mean-RH method).
2. Calculate extraterrestrial radiation from station latitude and day of year.
3. Calculate clear-sky radiation from station altitude.
4. Calculate net shortwave and net longwave radiation, retaining the raw cloudiness ratio and any FAO-56 ratio-bound diagnostics.
5. Calculate daily reference grass ET0 with the Penman–Monteith equation, using the derived net radiation and the same explicit station altitude.

## Output and traceability

`DailyReferenceIndicators` contains:
- tenant, location, date, latitude and altitude;
- calculation status;
- source observation IDs and variable codes used;
- missing variable codes, if any;
- the complete net-radiation result;
- the complete ET0 result;
- formula profile identifiers and diagnostics.

The persistence/orchestration layer must additionally store execution time, engine version, source snapshot/fingerprint and source metadata. Derived net radiation and ET0 must never overwrite source observations.

## Current provider compatibility

The normalized NASA POWER daily adapter already maps:
- `T2M`, `T2M_MAX`, `T2M_MIN`;
- `WS2M`;
- `ALLSKY_SFC_SW_DWN`;
- `RH2M`.

The adapter converts incoming daily irradiation to canonical `MJ/m2`. The pipeline consumes only the normalized observation contract and does not branch on NASA POWER identifiers.

## Limitations

- One daily location/provider/dataset group per calculation.
- FAO-56 reference grass ET0, not crop-specific ETc or actual water use.
- Station coordinates and altitude must be supplied from trusted location metadata.
- Daily mean RH is used because it is the canonical field available in the current NASA POWER adapter. The standalone ET0 function also supports direct actual vapour pressure, RH extremes and dew point.
- No automatic gap filling, source arbitration, or database persistence.

## Tests

The test suite covers complete calculation, explicit missing-data state, duplicate-variable rejection, mixed source identity, canonical-unit enforcement and timestamp/date consistency.
