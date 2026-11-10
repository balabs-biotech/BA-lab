"""Robust calendar-window anomaly screening for daily environmental series."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from math import isfinite
from statistics import median
from typing import Iterable, Literal


@dataclass(frozen=True, slots=True)
class DailyObservation:
    observed_date: date
    value: float


@dataclass(frozen=True, slots=True)
class TemporalAssessment:
    observed_date: date
    evaluated_value: float
    status: Literal[
        "normal",
        "suspect",
        "insufficient_history",
        "insufficient_coverage",
        "indeterminate",
    ]
    flags: tuple[str, ...]
    baseline_median: float | None
    robust_z_score: float | None
    history_count: int
    baseline_mad: float | None
    coverage_ratio: float


def assess_temporal_anomalies(
    observations: Iterable[DailyObservation],
    *,
    window: int = 30,
    minimum_history: int = 7,
    minimum_coverage_ratio: float = 0.6,
    threshold: float = 3.5,
) -> list[TemporalAssessment]:
    """Compare each day with observations in the preceding calendar-day window.

    The reference interval is [observed_date - window, observed_date). Missing
    dates are not synthesized. Coverage is the fraction of calendar days with
    an observation; the evaluated date and future observations are excluded.
    """
    if isinstance(window, bool) or not isinstance(window, int) or window < 1:
        raise ValueError("window must be a positive integer")
    if (
        isinstance(minimum_history, bool)
        or not isinstance(minimum_history, int)
        or minimum_history < 1
        or minimum_history > window
    ):
        raise ValueError("minimum_history must be between 1 and window")
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
        if not isinstance(row, DailyObservation):
            raise ValueError("all observations must be DailyObservation instances")
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

    results: list[TemporalAssessment] = []
    for index, row in enumerate(rows):
        window_start = row.observed_date - timedelta(days=window)
        history = [
            float(item.value)
            for item in rows[:index]
            if window_start <= item.observed_date < row.observed_date
        ]
        history_count = len(history)
        coverage = history_count / window

        if history_count < minimum_history:
            results.append(TemporalAssessment(
                row.observed_date, float(row.value), "insufficient_history",
                ("insufficient_history",), None, None, history_count, None, coverage
            ))
            continue
        if coverage < minimum_coverage_ratio:
            results.append(TemporalAssessment(
                row.observed_date, float(row.value), "insufficient_coverage",
                ("insufficient_coverage",), None, None, history_count, None, coverage
            ))
            continue

        center = median(history)
        mad = median([abs(item - center) for item in history])
        if mad == 0:
            results.append(TemporalAssessment(
                row.observed_date, float(row.value), "indeterminate",
                ("zero_mad_baseline",), center, None, history_count, mad, coverage
            ))
            continue

        robust_z = 0.6744897501960817 * (float(row.value) - center) / mad
        is_anomaly = abs(robust_z) > threshold
        results.append(TemporalAssessment(
            row.observed_date,
            float(row.value),
            "suspect" if is_anomaly else "normal",
            ("robust_deviation",) if is_anomaly else (),
            center,
            robust_z,
            history_count,
            mad,
            coverage,
        ))
    return results
