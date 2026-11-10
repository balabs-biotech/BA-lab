# Environmental plausibility screening v1

## Purpose

This layer screens individual normalized observations. It is deliberately
separate from unit conversion, temporal coverage, and statistical aggregation.

The result is a classification:
- `valid`: no configured screening rule was triggered;
- `suspect`: a broad screening threshold was exceeded; retain the observation
  but require review before using it in sensitive analysis;
- `invalid`: a physical constraint defined by the variable contract was
  violated; exclude it from derived indicators unless an explicit review
  workflow changes its disposition.

The screening function never edits, clips, imputes, or deletes the source value.

## Profile: global_screening_v1

| Variable | Hard constraint | Soft screening threshold |
|---|---|---|
| air_temperature_mean/max/min | none | below -90 °C or above 60 °C |
| relative_humidity_mean | 0–100 % | none |
| precipitation_corrected | non-negative | above 500 mm/day |
| solar_radiation_all_sky | non-negative | above 45 MJ/m²/day |
| wind_speed_mean | non-negative | above 75 m/s |
| surface_pressure | none | below 30,000 Pa or above 110,000 Pa |

These are broad data-screening limits, not local climatological bounds, crop
requirements, instrument specifications, or proof that a value is correct.
Soft thresholds intentionally produce `suspect`, not `invalid`. They must be
calibrated against source-product documentation and regional climatology
before being used to exclude observations automatically.

## Interpretation

- A value marked `valid` is only free of the current screening flags. It is
  not certified as accurate.
- A value marked `suspect` remains available for inspection and provenance.
- A value marked `invalid` is not silently removed from storage.
- Unit normalization does not imply quality validation.
- Missingness is handled by the separate coverage module.
- No statistical outlier detector or anomaly model is enabled in this version.

## Versioning

The profile identifier is returned with each assessment. Any threshold change
that could alter classifications requires a new profile version and tests.
