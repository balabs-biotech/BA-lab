"""Provider-neutral orchestration for one scoped environmental analysis.

This layer coordinates existing scientific modules. It performs no network I/O,
persistence, interpolation, or tenant authorization; those belong to adapters
and application boundaries outside the calculation engine.
"""

from collections import defaultdict
from datetime import date, datetime
from typing import Mapping
from uuid import UUID

from ba_environmental_engine.climate.aggregation import AggregationMethod
from ba_environmental_engine.climate.daily_reference import (
    calculate_daily_reference_indicators,
)
from ba_environmental_engine.climate.windows import calculate_rolling_climate_indicators
from ba_environmental_engine.serialization.bal_json import build_bal_analysis
from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation


_DEFAULT_ROLLING_WINDOWS = (7, 14, 30, 90)


def run_environmental_analysis(
    *,
    observations: list[NormalizedEnvironmentalObservation] | tuple[NormalizedEnvironmentalObservation, ...],
    analysis_id: UUID,
    generated_at: datetime,
    engine_version: str,
    scope_from: date,
    scope_to: date,
    latitude_deg: float,
    altitude_m: float,
    rolling_methods: Mapping[str, AggregationMethod] | None = None,
    rolling_windows: tuple[int, ...] = _DEFAULT_ROLLING_WINDOWS,
    minimum_rolling_coverage: float = 1.0,
):
    """Run daily FAO-56 and optional rolling indicators, then build BAL-JSON.

    Daily FAO-56 inputs are grouped by observation date. The daily calculator
    remains responsible for validating source coherence and canonical units.
    Rolling methods are explicit caller policy: this service never guesses
    whether a variable should be averaged, summed, minimized, or maximized.
    """
    rows = list(observations)
    if not rows:
        raise ValueError("at least one normalized source observation is required")
    if scope_to < scope_from:
        raise ValueError("scope_to must be on or after scope_from")
    if any(not isinstance(row, NormalizedEnvironmentalObservation) for row in rows):
        raise ValueError("all observations must be normalized environmental observations")
    if any(not scope_from <= row.observed_date <= scope_to for row in rows):
        raise ValueError("all observations must be contained within the requested scope")

    weather_by_date: dict[date, list[NormalizedEnvironmentalObservation]] = defaultdict(list)
    weather_by_variable: dict[str, dict[date, float]] = defaultdict(dict)
    units_by_variable: dict[str, str] = {}

    for row in rows:
        if row.data_family != "weather":
            continue
        weather_by_date[row.observed_date].append(row)
        if rolling_methods and row.variable_code in rolling_methods:
            if row.observed_date in weather_by_variable[row.variable_code]:
                raise ValueError(
                    "rolling analysis requires at most one observation per variable and date"
                )
            previous_unit = units_by_variable.setdefault(row.variable_code, row.unit)
            if previous_unit != row.unit:
                raise ValueError(
                    f"rolling variable {row.variable_code} has inconsistent canonical units"
                )
            weather_by_variable[row.variable_code][row.observed_date] = row.value

    if not weather_by_date:
        raise ValueError("at least one weather observation is required")

    daily_results = [
        calculate_daily_reference_indicators(
            weather_by_date[observed_date],
            latitude_deg=latitude_deg,
            altitude_m=altitude_m,
        )
        for observed_date in sorted(weather_by_date)
    ]

    rolling_results = []
    if rolling_methods:
        if set(rolling_methods) != set(weather_by_variable):
            missing = sorted(set(rolling_methods) - set(weather_by_variable))
            raise ValueError(
                "rolling methods require observations for every configured variable: "
                + ", ".join(missing)
            )
        rolling_results = calculate_rolling_climate_indicators(
            weather_by_variable,
            end_date=scope_to,
            methods=rolling_methods,
            window_days=rolling_windows,
            minimum_coverage_ratio=minimum_rolling_coverage,
            units=units_by_variable,
        )

    return build_bal_analysis(
        observations=rows,
        daily_indicators=daily_results,
        rolling_indicators=rolling_results,
        analysis_id=analysis_id,
        generated_at=generated_at,
        engine_version=engine_version,
        scope_from=scope_from,
        scope_to=scope_to,
    )
