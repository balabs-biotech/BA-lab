# Temporal anomaly screening v1

## Method

The first temporal screening profile uses a trailing rolling baseline and the
modified robust z-score:

`z = 0.67448975 × (x - median(history)) / MAD(history)`

where MAD is the median absolute deviation from the historical median.

- The current observation is never included in its own baseline.
- Only preceding observations are used; no future leakage.
- Default window: 30 available preceding observations.
- Minimum history: 7 preceding observations.
- Default suspect threshold: absolute robust z-score greater than 3.5.
- Values are flagged, never clipped, replaced, or deleted.

## Statuses

- `normal`: enough history and score within threshold.
- `suspect`: robust deviation exceeds threshold.
- `insufficient_history`: not enough preceding observations.
- `indeterminate`: historical MAD is zero; the method does not invent a
  denominator or flag a possible event using an arbitrary epsilon.

Input dates must be strictly increasing and unique. Missing calendar days are
not synthesized. The rolling window counts available observations, not
calendar days. Coverage remains a separate quality dimension.

## Limitations

This is a univariate screening method, not a causal diagnosis. It does not
model seasonality, trends, crop stages, local climate normals, or dependencies
between variables. A seasonal shift can be flagged as suspect. A future
seasonal baseline should compare observations with equivalent calendar
periods or a documented climatological reference, once sufficient historical
data exist.

For zero-inflated variables such as precipitation, a zero MAD often occurs.
This implementation marks the result indeterminate rather than generating
false positives. Variable-specific methods may later be introduced with
their own versioned profiles and tests.
