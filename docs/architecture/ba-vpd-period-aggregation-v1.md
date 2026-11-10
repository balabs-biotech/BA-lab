# VPD period aggregation v1

## Purpose

Aggregate a sequence of already calculated air-VPD observations into a
period-level summary without losing the distinction between sample statistics
and estimated time above a threshold.

## Input contract

Each observation contains a timezone-aware timestamp and a finite,
non-negative VPD value in kPa. Timestamps must be strictly increasing and
unique. Empty sequences, naive timestamps, negative VPD values and invalid
threshold/gap parameters are rejected.

## Outputs

- Arithmetic sample mean, minimum and maximum VPD.
- Number of observations.
- Configured VPD threshold.
- Estimated duration above the threshold, in hours.
- Number of adjacent sampling gaps excluded from duration estimation.

The mean/minimum/maximum are statistics over samples, not time-weighted
estimates. They must not be described as continuous exposure averages.

## Duration estimation

For each adjacent pair, the VPD trajectory is assumed linear between samples.
If both endpoints are above the threshold, the full interval is counted. If
the segment crosses the threshold, the crossing time is linearly interpolated.
If both endpoints are at or below threshold, no duration is counted.

An interval longer than `maximum_gap_hours` (default 2 h) is excluded and
increments `excluded_gap_count`. No interpolation is attempted across that
gap. This avoids pretending that sparse samples describe unobserved exposure.

## Interpretation limits

The interpolation is an explicit engineering approximation, not a direct
measurement of continuous exposure. Results depend on sensor sampling
frequency, sensor placement, clock quality and selected maximum gap. Keep
indoor chamber observations separate from outdoor weather-provider records.
Thresholds must be configured by application and biological context; this
module does not prescribe a universal safe VPD range.

The aggregation is a pure calculation. Persistence should retain the source
observation IDs, location/context, selected threshold, maximum gap and
algorithm version alongside any stored derived result.
