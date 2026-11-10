"""Coverage assessment for daily environmental time series."""

from dataclasses import dataclass
from datetime import date, timedelta
from math import isfinite
from typing import Iterable


@dataclass(frozen=True, slots=True)
class DailyCoverage:
    """Coverage report for an inclusive daily date window."""

    start: date
    end: date
    expected: int
    observed: int
    ratio: float
    available: bool
    missing_dates: list[date]


def assess_daily_coverage(
    start: date,
    end: date,
    observed_dates: Iterable[date],
    *,
    minimum_ratio: float = 1.0,
) -> DailyCoverage:
    """Assess unique observations within an inclusive date window.

    Dates outside the requested window are ignored. Duplicate dates count once.
    No missing values are imputed.
    """
    if end < start:
        raise ValueError("end must be on or after start")
    if not isfinite(minimum_ratio) or not 0.0 <= minimum_ratio <= 1.0:
        raise ValueError("minimum_ratio must be a finite number between 0 and 1")

    expected = (end - start).days + 1
    observed_set = {
        item for item in observed_dates
        if isinstance(item, date) and start <= item <= end
    }
    missing = [
        start + timedelta(days=offset)
        for offset in range(expected)
        if start + timedelta(days=offset) not in observed_set
    ]
    observed = expected - len(missing)
    ratio = observed / expected

    return DailyCoverage(
        start=start,
        end=end,
        expected=expected,
        observed=observed,
        ratio=ratio,
        available=ratio >= minimum_ratio,
        missing_dates=missing,
    )
