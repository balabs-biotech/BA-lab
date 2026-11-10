"""Time-window aggregation for derived vapor-pressure deficit observations."""

from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from statistics import fmean
from typing import Iterable


@dataclass(frozen=True, slots=True)
class VPDObservation:
    observed_at: datetime
    vpd_kpa: float


@dataclass(frozen=True, slots=True)
class VPDAggregate:
    mean_vpd_kpa: float
    minimum_vpd_kpa: float
    maximum_vpd_kpa: float
    observation_count: int
    duration_above_threshold_hours: float
    threshold_kpa: float
    excluded_gap_count: int


def _duration_above_threshold(
    first_value: float,
    second_value: float,
    interval_hours: float,
    threshold: float,
) -> float:
    first_above = first_value > threshold
    second_above = second_value > threshold
    if first_above and second_above:
        return interval_hours
    if not first_above and not second_above:
        return 0.0

    crossing_fraction = (threshold - first_value) / (second_value - first_value)
    if first_above:
        return interval_hours * crossing_fraction
    return interval_hours * (1.0 - crossing_fraction)


def aggregate_vpd_period(
    observations: Iterable[VPDObservation],
    *,
    threshold_kpa: float,
    maximum_gap_hours: float = 2.0,
) -> VPDAggregate:
    """Summarize samples and estimate above-threshold duration between samples.

    Duration is linearly interpolated only across adjacent samples whose gap
    does not exceed maximum_gap_hours. The mean/min/max are sample statistics,
    not time-weighted estimates.
    """
    for name, value in (
        ("threshold_kpa", threshold_kpa),
        ("maximum_gap_hours", maximum_gap_hours),
    ):
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not isfinite(value)
            or value <= 0
        ):
            raise ValueError(f"{name} must be a finite positive number")

    rows = list(observations)
    if not rows:
        raise ValueError("at least one VPD observation is required")

    previous_at: datetime | None = None
    values: list[float] = []
    for row in rows:
        if not isinstance(row, VPDObservation):
            raise ValueError("all observations must be VPDObservation instances")
        if not isinstance(row.observed_at, datetime):
            raise ValueError("observed_at must be a datetime")
        if row.observed_at.tzinfo is None or row.observed_at.utcoffset() is None:
            raise ValueError("observed_at must include a valid timezone")
        if previous_at is not None and row.observed_at <= previous_at:
            raise ValueError("timestamps must be strictly increasing")
        if (
            isinstance(row.vpd_kpa, bool)
            or not isinstance(row.vpd_kpa, (int, float))
            or not isfinite(row.vpd_kpa)
            or row.vpd_kpa < 0
        ):
            raise ValueError("VPD value must be finite, numeric, and non-negative")
        values.append(float(row.vpd_kpa))
        previous_at = row.observed_at

    duration = 0.0
    excluded_gaps = 0
    for first, second in zip(rows, rows[1:]):
        gap_hours = (second.observed_at - first.observed_at).total_seconds() / 3600
        if gap_hours > maximum_gap_hours:
            excluded_gaps += 1
            continue
        duration += _duration_above_threshold(
            float(first.vpd_kpa),
            float(second.vpd_kpa),
            gap_hours,
            float(threshold_kpa),
        )

    return VPDAggregate(
        mean_vpd_kpa=fmean(values),
        minimum_vpd_kpa=min(values),
        maximum_vpd_kpa=max(values),
        observation_count=len(values),
        duration_above_threshold_hours=duration,
        threshold_kpa=float(threshold_kpa),
        excluded_gap_count=excluded_gaps,
    )
