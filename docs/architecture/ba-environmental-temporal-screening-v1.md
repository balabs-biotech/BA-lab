# Temporal anomaly screening v1

## Method

The temporal screening profile compares a daily observation with a trailing
calendar-day baseline using the modified robust z-score:

`z = 0.67448975 × (x - median(history)) / MAD(history)`

where MAD is the median absolute deviation from the historical median.

- The current observation is never included in its own baseline.
- Only preceding observations inside the calendar interval
  `[observed_date - window, observed_date)` are used.
- Default window: 30 calendar days.
- Default minimum history: 7 observations.
- Default minimum coverage: 0.60 of calendar days in the window.
- Default suspect threshold: absolute robust z-score greater than 3.5.
- Values are flagged, never clipped, replaced, or deleted.
- Missing dates are not synthesized or interpolated.

## Statuses

- `normal`: enough history and coverage; score within threshold.
- `suspect`: robust deviation exceeds threshold.
- `insufficient_history`: fewer than the configured minimum observations.
- `insufficient_coverage`: enough observations exist, but calendar coverage is
  below the configured minimum.
- `indeterminate`: historical MAD is zero; the method does not invent a
  denominator or use an arbitrary epsilon.

Each result reports the baseline median, MAD, robust z-score (when defined),
history count and coverage ratio. These are statistical screening outputs,
not biological diagnoses.

Input dates must be strictly increasing and unique. The evaluated date and
future observations are excluded from the reference baseline.

## Limitations

This is a univariate screening method, not a causal diagnosis. It does not
model seasonality, trends, crop stages, local climate normals, or dependencies
between variables. A seasonal shift can be flagged as suspect. The separate
seasonal reference method compares observations with equivalent calendar
periods from prior years when sufficient history exists.

For zero-inflated variables such as precipitation, a zero MAD often occurs.
This implementation marks the result indeterminate rather than generating
false positives. Variable-specific methods may later be introduced with
their own versioned profiles and tests.

## Integration boundary

The function in `ba_environmental_engine.quality.temporal` is a pure,
deterministic calculation. It performs no network requests, persistence,
tenant authorization, biological interpretation, or recommendation. A caller
must select one variable and one compatible unit series before invoking it.
