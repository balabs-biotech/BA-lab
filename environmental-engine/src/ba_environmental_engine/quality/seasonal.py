"""Seasonally aligned historical reference screening."""

from dataclasses import dataclass
from datetime import date, datetime
from math import isfinite
from statistics import median
from typing import Iterable, Literal


@dataclass(frozen=True, slots=True)
class DailySeasonalObservation:
    observed_date: date
    value: float


@dataclass(frozen=True, slots=True)
class SeasonalAssessment:
    observed_date: date
    evaluated_value: float
    status: Literal["normal", "suspect", "insufficient_reference", "indeterminate"]
    flags: tuple[str, ...]
    reference_median: float | None
    robust_z_score: float | None
    reference_years: tuple[int, ...]
    reference_count: int


def _seasonal_day(value: date) -> int:
    """Map month/day to a leap-year calendar so dates after February align."""
    return date(2000, value.month, value.day).timetuple().tm_yday


def assess_seasonal_reference(
    observations: Iterable[DailySeasonalObservation],
    *,
    minimum_years: int = 3,
    half_window_days: int = 15,
    threshold: float = 3.5,
) -> list[SeasonalAssessment]:
    """Compare each observation with nearby calendar dates in prior years only."""
    if isinstance(minimum_years, bool) or not isinstance(minimum_years, int) or minimum_years < 1:
        raise ValueError("minimum_years must be a positive integer")
    if isinstance(half_window_days, bool) or not isinstance(half_window_days, int) or not 0 <= half_window_days <= 183:
        raise ValueError("half_window_days must be between 0 and 183")
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
        if not isinstance(row, DailySeasonalObservation):
            raise ValueError("all observations must be DailySeasonalObservation instances")
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

    by_seasonal_day: dict[int, list[tuple[int, float]]] = {}
    for historical in rows:
        day = _seasonal_day(historical.observed_date)
        by_seasonal_day.setdefault(day, []).append(
            (historical.observed_date.year, float(historical.value))
        )

    results: list[SeasonalAssessment] = []
    for row in rows:
        target_day = _seasonal_day(row.observed_date)
        candidates: list[tuple[int, float]] = []
        for offset in range(-half_window_days, half_window_days + 1):
            seasonal_day = ((target_day - 1 + offset) % 366) + 1
            candidates.extend(
                (year, value)
                for year, value in by_seasonal_day.get(seasonal_day, [])
                if year < row.observed_date.year
            )

        years = tuple(sorted({year for year, _ in candidates}))
        if len(years) < minimum_years:
            results.append(SeasonalAssessment(
                row.observed_date, float(row.value), "insufficient_reference",
                ("insufficient_reference",), None, None, years, len(candidates)
            ))
            continue

        values = [value for _, value in candidates]
        center = median(values)
        mad = median([abs(value - center) for value in values])
        if mad == 0:
            results.append(SeasonalAssessment(
                row.observed_date, float(row.value), "indeterminate",
                ("zero_mad_reference",), center, None, years, len(values)
            ))
            continue

        robust_z = 0.6744897501960817 * (float(row.value) - center) / mad
        suspect = abs(robust_z) > threshold
        results.append(SeasonalAssessment(
            row.observed_date,
            float(row.value),
            "suspect" if suspect else "normal",
            ("seasonal_deviation",) if suspect else (),
            center,
            robust_z,
            years,
            len(values),
        ))
    return results
