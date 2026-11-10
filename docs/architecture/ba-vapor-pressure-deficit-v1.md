# Vapor-pressure deficit (VPD) v1

## Definition

This indicator computes air vapor-pressure deficit from daily or instantaneous
air temperature and relative humidity:

- Saturation vapor pressure: `es = 0.6108 × exp(17.27 × T / (T + 237.3))`
- Actual vapor pressure: `ea = es × RH / 100`
- Vapor-pressure deficit: `VPD = es − ea`

Temperature is accepted in degrees Celsius, relative humidity in percent, and
all vapor pressures are returned in kPa. The equation profile is versioned as
`tetens_fao56_v1`.

## Input contract

Both inputs must be finite numeric values; booleans are rejected. Relative
humidity must be between 0 and 100%. Temperature must be above the singular
boundary of the equation. Inputs are preserved in the immutable result.

## Interpretation

This is **air VPD**, derived from air temperature and relative humidity. It is
not leaf-to-air VPD, because leaf temperature is not measured or estimated.
It does not directly diagnose plant water stress, fungal growth suitability,
or chamber performance. Such interpretation requires organism- and
application-specific response ranges, sensor placement, temporal aggregation,
and calibration.

Do not combine measurements from different locations or sensor contexts.
A chamber sensor and an outdoor weather feed must remain distinct input
contexts. The calculation itself performs no imputation, smoothing, or
quality repair; upstream quality assessments remain attached to the source
observations.

## Scope

The first implementation is a pure deterministic calculation. It does not
fetch data, write to Supabase, or create observations. Its output is a derived
indicator and must retain links to the exact source observations when
integrated into the persistence layer.
