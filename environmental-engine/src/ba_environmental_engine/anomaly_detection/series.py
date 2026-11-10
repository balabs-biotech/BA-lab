"""Trailing-window robust anomaly detection for daily environmental series.

This module identifies statistical deviations only. It does not infer biological
impact, diagnose a culture, repair observations, or issue recommendations.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from math import isfinite
from statistics import median
from typing import Iterable, Literal


@dataclass(frozen=True, slots=True)
class DailySeriesObservation:
    observed_date: date
    value: float


@dataclass(frozen=True, slots=True)
class SeriesAnomalyAssessment:
    observed_date: date
    evaluated_value: float
    status: Literal[
        "normal",
        "suspect",
        "insufficient_reference",
        "insufficient_coverage",
        "indeterminate",
    ]
    flags: tuple[str, ...]
    reference_median: float | None
    median_absolute_deviation: float | None
    robust_z_score: float | None
    reference_count: int
    coverage_ratio: float


def assess_series_anomalies(
    observations: Iterable[DailySeriesObservation],
    *,
    baseline_window_days: int = 30,
    minimum_reference_count: int = 10,
    minimum_coverage_ratio: float = 0.6,
    threshold: float = 3.5,
) -> list[SeriesAnomalyAssessment]:
    """Assess each daily value against valid observations in the preceding window.

    The reference interval is [observed_date - baseline_window_days,
    observed_date). The evaluated day and all future observations are excluded.
    Coverage is the fraction of calendar days in that interval with an
    observation. A low-coverage or undersampled baseline is never called normal.
    """
    if (
        isinstance(baseline_window_days, bool)
        or not isinstance(baseline_window_days, int)
        or baseline_window_days < 1
    ):
        raise ValueError("baseline_window_days must be a positive integer")
    if (
        isinstance(minimum_reference_count, bool)
        or not isinstance(minimum_reference_count, int)
        or minimum_reference_count < 3
        or minimum_reference_count > baseline_window_days
    ):
        raise ValueError("minimum_reference_count must be between 3 and baseline_window_days")
    if (
        isinstance(minimum_coverage_ratio, bool)
        or not isinstance(minimum_coverage_ratio, (int, float))
        or not isfinite(minimum_coverage_ratio)
        or not 0 <= minimum_coverage_ratio <= 1
    ):
        raise ValueError("minimum_coverage_ratio must be between 0 and 1")
    if (
        isinstance(threshold, bool)
        or not isinstance(threshold, (int, float))
        or not isfinite(threshold)
        or threshold <= 0
    ):
        raise ValueError("threshold must be a finite positive number")

    rows = list(observations)
    previous_date: date | None = None
    for row in rows:
        if not isinstance(row, DailySeriesObservation):
            raise ValueError("all observations must be DailySeriesObservation instances")
        if not isinstance(row.observed_date, date) or isinstance(row.observed_date, datetime):
            raise ValueError("observed_date must be a date without a time component")
        if previous_date is not None and row.observed_date <= previous_date:
            raise ValueError("observations must be sorted with no duplicate dates")
        if (
            isinstance(row.value, bool)
            or not isinstance(row.value, (int, float))
            or not isfinite(row.value)
        ):
            raise ValueError("observation value must be finite and numeric")
        previous_date = row.observed_date

    by_date = {row.observed_date: float(row.value) for row in rows}
    results: list[SeriesAnomalyAssessment] = []
    for row in rows:
        start = row.observed_date - timedelta(days=baseline_window_days)
        reference = [
            value
            for day, value in by_date.items()
            if start <= day < row.observed_date
        ]
        count = len(reference)
        coverage = count / baseline_window_days

        if coverage < minimum_coverage_ratio:
            results.append(SeriesAnomalyAssessment(
                row.observed_date, float(row.value), "insufficient_coverage",
                ("insufficient_coverage",), None, None, None, count, coverage
            ))
            continue
        if count < minimum_reference_count:
            results.append(SeriesAnomalyAssessment(
                row.observed_date, float(row.value), "insufficient_reference",
                ("insufficient_reference",), None, None, None, count, coverage
            ))
            continue

        center = median(reference)
        mad = median([abs(value - center) for value in reference])
        if mad == 0:
            if float(row.value) == center:
                results.append(SeriesAnomalyAssessment(
                    row.observed_date, float(row.value), "normal", (),
                    center, mad, 0.0, count, coverage
                ))
            else:
                results.append(SeriesAnomalyAssessment(
                    row.observed_date, float(row.value), "indeterminate",
                    ("zero_mad_reference",), center, mad, None, count, coverage
                ))
            continue

        robust_z = 0.6744897501960817 * (float(row.value) - center) / mad
        suspect = abs(robust_z) > threshold
        results.append(SeriesAnomalyAssessment(
            row.observed_date,
            float(row.value),
            "suspect" if suspect else "normal",
            ("historical_deviation",) if suspect else (),
            center,
            mad,
            robust_z,
            count,
            coverage,
        ))
    return results
