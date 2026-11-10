"""Robust rolling anomaly screening for daily environmental series."""

from dataclasses import dataclass
from datetime import date
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
    status: Literal["normal", "suspect", "insufficient_history", "indeterminate"]
    flags: tuple[str, ...]
    baseline_median: float | None
    robust_z_score: float | None
    history_count: int


def assess_temporal_anomalies(
    observations: Iterable[DailyObservation],
    *,
    window: int = 30,
    minimum_history: int = 7,
    threshold: float = 3.5,
) -> list[TemporalAssessment]:
    """Compare each day only with preceding observations using median/MAD."""
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
        if not isinstance(row.observed_date, date):
            raise ValueError("observed_date must be a date")
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
        history = [
            float(item.value) for item in rows[max(0, index - window):index]
        ]
        if len(history) < minimum_history:
            results.append(TemporalAssessment(
                row.observed_date, float(row.value), "insufficient_history",
                ("insufficient_history",), None, None, len(history)
            ))
            continue

        center = median(history)
        mad = median([abs(item - center) for item in history])
        if mad == 0:
            results.append(TemporalAssessment(
                row.observed_date, float(row.value), "indeterminate",
                ("zero_mad_baseline",), center, None, len(history)
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
            len(history),
        ))
    return results
