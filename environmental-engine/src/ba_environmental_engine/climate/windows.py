"""Deterministic rolling climate summaries over explicit daily windows."""

from dataclasses import dataclass
from datetime import date, timedelta, datetime
from math import isfinite
from typing import Mapping, Sequence

from ba_environmental_engine.climate.aggregation import (
    AggregationMethod,
    DailyAggregation,
    aggregate_daily_values,
)


@dataclass(frozen=True, slots=True)
class ClimateWindowIndicator:
    """One variable's descriptive aggregate over an inclusive rolling window."""

    variable_code: str
    window_days: int
    period_start: date
    period_end: date
    aggregation: DailyAggregation


def calculate_rolling_climate_indicators(
    daily_series: Mapping[str, Mapping[date, float]],
    *,
    end_date: date,
    methods: Mapping[str, AggregationMethod],
    window_days: Sequence[int] = (7, 14, 30, 90),
    minimum_coverage_ratio: float = 1.0,
    units: Mapping[str, str] | None = None,
) -> tuple[ClimateWindowIndicator, ...]:
    """Calculate descriptive indicators over trailing inclusive daily windows.

    Each window ends on `end_date` and includes exactly `window_days`
    calendar dates. Missing dates are never filled. The existing daily
    aggregation and coverage implementation is reused; a result is available
    only when its variable-specific observed-date ratio meets the configured
    threshold. The caller chooses the scientifically appropriate aggregation
    for each variable (for example, mean temperature or summed precipitation).
    """
    if isinstance(end_date, datetime) or not isinstance(end_date, date):
        raise ValueError("end_date must be a datetime.date, not a datetime")

    if not isinstance(daily_series, Mapping) or not daily_series:
        raise ValueError("daily_series must contain at least one variable")
    if not isinstance(methods, Mapping):
        raise ValueError("methods must be a mapping")
    variable_codes = set(daily_series)
    if variable_codes != set(methods):
        raise ValueError("daily_series and methods must contain the same variable codes")
    if any(not isinstance(code, str) or not code.strip() for code in variable_codes):
        raise ValueError("variable codes must be non-empty strings")

    if (
        isinstance(minimum_coverage_ratio, bool)
        or not isinstance(minimum_coverage_ratio, (int, float))
        or not isfinite(minimum_coverage_ratio)
        or not 0.0 < minimum_coverage_ratio <= 1.0
    ):
        raise ValueError("minimum_coverage_ratio must be finite and in the range (0, 1]")

    windows = tuple(window_days)
    if not windows:
        raise ValueError("window_days must contain at least one positive integer")
    if any(
        isinstance(days, bool) or not isinstance(days, int) or days <= 0
        for days in windows
    ):
        raise ValueError("window_days must contain only positive integers")
    if len(set(windows)) != len(windows):
        raise ValueError("window_days must not contain duplicates")

    if units is not None:
        if not isinstance(units, Mapping) or not set(units).issubset(variable_codes):
            raise ValueError("units keys must be a subset of daily_series variable codes")
        if any(value is not None and (not isinstance(value, str) or not value.strip())
               for value in units.values()):
            raise ValueError("units must contain non-empty strings")

    results: list[ClimateWindowIndicator] = []
    for variable_code in sorted(variable_codes):
        values = daily_series[variable_code]
        if not isinstance(values, Mapping):
            raise ValueError(f"daily series for {variable_code} must be a date-to-value mapping")
        for observed_date in values:
            if isinstance(observed_date, datetime) or not isinstance(observed_date, date):
                raise ValueError(
                    f"daily series for {variable_code} must use datetime.date keys"
                )

        for days in windows:
            period_start = end_date - timedelta(days=days - 1)
            aggregation = aggregate_daily_values(
                values,
                period_start,
                end_date,
                method=methods[variable_code],
                minimum_ratio=float(minimum_coverage_ratio),
                unit=units.get(variable_code) if units is not None else None,
            )
            results.append(
                ClimateWindowIndicator(
                    variable_code=variable_code,
                    window_days=days,
                    period_start=period_start,
                    period_end=end_date,
                    aggregation=aggregation,
                )
            )

    return tuple(results)
