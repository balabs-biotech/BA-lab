# Seasonal reference screening v1

## Purpose

A rolling recent-history baseline can mistake a normal seasonal transition for
an anomaly. This profile compares each daily observation with nearby calendar
dates from **strictly earlier years**.

## Method

- Calendar alignment uses a 366-day reference calendar, so dates after
  February remain aligned across leap and non-leap years.
- The reference window is circular around the year boundary and defaults to
  ±15 calendar days.
- Only observations from years earlier than the evaluated observation are
  eligible. Same-year and future observations are excluded.
- At least three distinct historical years are required by default.
- The reference center is the median; dispersion is the median absolute
  deviation (MAD).
- A modified robust z-score above 3.5 in absolute value produces
  `suspect`.
- A zero MAD produces `indeterminate`, not a synthetic denominator.

The input must be sorted by unique date and contain finite numeric values.
Missing dates are not interpolated. The reference count and contributing years
are returned with each assessment.

## Statuses

- `normal`: enough historical years and no robust deviation above threshold.
- `suspect`: unusual relative to the seasonal reference.
- `insufficient_reference`: fewer than the configured number of prior years.
- `indeterminate`: the reference MAD is zero.

## Interpretation limits

This is a seasonal statistical reference, not a diagnosis of climate change,
crop stress, sensor failure, or biological response. Its output depends on the
available archive and chosen calendar window. Three years is only a minimum
screening threshold, not a strong climatological normal. Operational use
should prefer longer, quality-controlled archives and variable-specific
validation.

For local deployment, the profile must be evaluated separately for each
location and variable. Do not pool measurements from different locations or
different measurement definitions into one reference distribution.
