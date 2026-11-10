"""Deterministic aggregation of daily environmental observations."""

from dataclasses import dataclass
from datetime import date
from math import isfinite
from typing import Literal, Mapping

from ba_environmental_engine.quality.coverage import DailyCoverage, assess_daily_coverage

AggregationMethod = Literal["mean", "sum", "min", "max"]


@dataclass(frozen=True, slots=True)
class DailyAggregation:
    """A descriptive aggregate with its input coverage report."""

    value: float | None
    unit: str | None
    status: Literal["available", "insufficient_data"]
    method: AggregationMethod
    coverage: DailyCoverage


def aggregate_daily_values(
    values: Mapping[date, float],
    start: date,
    end: date,
    *,
    method: AggregationMethod,
    minimum_ratio: float = 1.0,
    unit: str | None = None,
) -> DailyAggregation:
    """Aggregate daily values only when the configured coverage is met.

    The date window is inclusive. Missing dates are never filled. Non-finite
    values are rejected rather than silently dropped or converted.
    """
    if method not in ("mean", "sum", "min", "max"):
        raise ValueError(f"unsupported aggregation method: {method}")

    for observed_date, value in values.items():
        if not isinstance(observed_date, date):
            raise TypeError("observation keys must be datetime.date values")
        if not isinstance(value, (int, float)) or not isfinite(value):
            raise ValueError("observation values must be finite numbers")

    coverage = assess_daily_coverage(
        start, end, values.keys(), minimum_ratio=minimum_ratio
    )
    if not coverage.available:
        return DailyAggregation(
            value=None,
            unit=unit,
            status="insufficient_data",
            method=method,
            coverage=coverage,
        )

    selected = [
        float(values[day])
        for day in sorted(values)
        if start <= day <= end
    ]
    if method == "mean":
        result = sum(selected) / len(selected)
    elif method == "sum":
        result = sum(selected)
    elif method == "min":
        result = min(selected)
    else:
        result = max(selected)

    return DailyAggregation(
        value=result,
        unit=unit,
        status="available",
        method=method,
        coverage=coverage,
    )
