"""Provider-neutral orchestration for one scoped environmental analysis.

This layer coordinates existing scientific modules. It performs no network I/O,
persistence, interpolation, or tenant authorization; those belong to adapters
and application boundaries outside the calculation engine.
"""

from collections import defaultdict
from datetime import date, datetime
from typing import Iterable, Mapping
from uuid import UUID

from ba_environmental_engine.climate.aggregation import AggregationMethod
from ba_environmental_engine.climate.daily_reference import (
    calculate_daily_reference_indicators,
)
from ba_environmental_engine.climate.windows import calculate_rolling_climate_indicators
from ba_environmental_engine.contracts.bal_json import BALAnalysis
from ba_environmental_engine.quality.findings import build_temporal_findings
from ba_environmental_engine.quality.temporal import DailyObservation, assess_temporal_anomalies
from ba_environmental_engine.serialization.bal_json import build_bal_analysis
from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation


_DEFAULT_ROLLING_WINDOWS = (7, 14, 30, 90)


def run_environmental_analysis(
    *,
    observations: Iterable[NormalizedEnvironmentalObservation],
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
    temporal_variables: tuple[str, ...] | None = None,
    temporal_window: int = 30,
    temporal_minimum_history: int = 7,
    temporal_minimum_coverage: float = 0.6,
    temporal_threshold: float = 3.5,
) -> BALAnalysis:
    """Run daily FAO-56, optional rolling indicators and temporal screening.

    Weather observations are grouped by date for daily FAO-56 calculations and
    by variable for independent temporal screening. Temporal screening defaults
    to every weather variable; callers may select a subset or pass an empty
    tuple to disable it. Every finding retains exact source-observation lineage.

    Rolling methods remain explicit caller policy: this service never guesses
    whether a variable should be averaged, summed, minimized, or maximized.
    The service performs no network I/O, persistence, interpolation or auth.
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
    rolling_by_variable: dict[str, dict[date, float]] = defaultdict(dict)
    rolling_units: dict[str, str] = {}

    for row in rows:
        if row.data_family != "weather":
            continue
        weather_by_date[row.observed_date].append(row)
        if row.observed_date in weather_by_variable[row.variable_code]:
            raise ValueError(
                "temporal and rolling analysis require at most one observation per variable and date"
            )
        previous_unit = units_by_variable.setdefault(row.variable_code, row.unit)
        if previous_unit != row.unit:
            raise ValueError(
                f"weather variable {row.variable_code} has inconsistent canonical units"
            )
        weather_by_variable[row.variable_code][row.observed_date] = row.value
        if rolling_methods and row.variable_code in rolling_methods:
            rolling_by_variable[row.variable_code][row.observed_date] = row.value
            rolling_units[row.variable_code] = row.unit

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
        if not rolling_windows or any(
            isinstance(days, bool) or not isinstance(days, int) or days <= 0
            for days in rolling_windows
        ):
            raise ValueError("rolling_windows must contain positive integers")
        if len(set(rolling_windows)) != len(rolling_windows):
            raise ValueError("rolling_windows must not contain duplicates")
        available_scope_days = (scope_to - scope_from).days + 1
        if max(rolling_windows) > available_scope_days:
            raise ValueError(
                "requested scope must contain the full length of every rolling window"
            )
        if set(rolling_methods) != set(rolling_by_variable):
            missing = sorted(set(rolling_methods) - set(rolling_by_variable))
            raise ValueError(
                "rolling methods require observations for every configured variable: "
                + ", ".join(missing)
            )
        rolling_results = calculate_rolling_climate_indicators(
            rolling_by_variable,
            end_date=scope_to,
            methods=rolling_methods,
            window_days=rolling_windows,
            minimum_coverage_ratio=minimum_rolling_coverage,
            units=rolling_units,
        )

    selected_temporal_variables = (
        tuple(sorted(weather_by_variable))
        if temporal_variables is None
        else tuple(temporal_variables)
    )
    if len(set(selected_temporal_variables)) != len(selected_temporal_variables):
        raise ValueError("temporal_variables must not contain duplicates")
    unknown_temporal_variables = sorted(
        set(selected_temporal_variables) - set(weather_by_variable)
    )
    if unknown_temporal_variables:
        raise ValueError(
            "temporal screening variables require weather observations: "
            + ", ".join(unknown_temporal_variables)
        )

    temporal_findings = []
    for variable_code in selected_temporal_variables:
        dated_values = weather_by_variable[variable_code]
        ordered_dates = sorted(dated_values)
        assessments = assess_temporal_anomalies(
            [
                DailyObservation(observed_date=day, value=dated_values[day])
                for day in ordered_dates
            ],
            window=temporal_window,
            minimum_history=temporal_minimum_history,
            minimum_coverage_ratio=temporal_minimum_coverage,
            threshold=temporal_threshold,
        )
        source_ids_by_date = {
            row.observed_date: [row.source_observation_id]
            for row in rows
            if row.data_family == "weather" and row.variable_code == variable_code
        }
        temporal_findings.extend(
            build_temporal_findings(
                analysis_id=analysis_id,
                variable_code=variable_code,
                unit=units_by_variable[variable_code],
                assessments=assessments,
                source_observation_ids_by_date=source_ids_by_date,
            )
        )

    return build_bal_analysis(
        observations=rows,
        daily_indicators=daily_results,
        rolling_indicators=rolling_results,
        findings=temporal_findings,
        analysis_id=analysis_id,
        generated_at=generated_at,
        engine_version=engine_version,
        scope_from=scope_from,
        scope_to=scope_to,
    )
