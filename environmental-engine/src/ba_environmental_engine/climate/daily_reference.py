"""Provider-neutral orchestration for daily FAO-56 reference indicators."""

from dataclasses import dataclass
from datetime import date
from math import isfinite
from typing import Iterable, Literal
from uuid import UUID

from ba_environmental_engine.indicators.net_radiation import (
    FAO56NetRadiationResult,
    calculate_fao56_net_radiation,
)
from ba_environmental_engine.indicators.reference_evapotranspiration import (
    FAO56ET0Result,
    calculate_fao56_et0,
)
from ba_environmental_engine.indicators.vapor_pressure import (
    actual_vapor_pressure_from_mean_rh,
)
from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation


_REQUIRED_UNITS: dict[str, str] = {
    "air_temperature_mean": "degC",
    "air_temperature_max": "degC",
    "air_temperature_min": "degC",
    "wind_speed_mean": "m/s",
    "solar_radiation_all_sky": "MJ/m2",
    "relative_humidity_mean": "%",
}


@dataclass(frozen=True, slots=True)
class DailyReferenceIndicators:
    """Traceable daily reference radiation and ET0 calculation outcome."""

    observed_date: date
    organization_id: UUID
    location_id: UUID
    latitude_deg: float
    altitude_m: float
    status: Literal["available", "insufficient_data"]
    source_observation_ids: tuple[UUID, ...]
    source_variable_codes: tuple[str, ...]
    missing_variables: tuple[str, ...]
    net_radiation: FAO56NetRadiationResult | None
    et0: FAO56ET0Result | None
    formula_profiles: tuple[str, ...]
    diagnostics: tuple[str, ...]


def calculate_daily_reference_indicators(
    observations: Iterable[NormalizedEnvironmentalObservation],
    *,
    latitude_deg: float,
    altitude_m: float,
) -> DailyReferenceIndicators:
    """Calculate daily Rn and ET0 from one coherent normalized weather dataset.

    Missing required variables produce an explicit insufficient-data result.
    Duplicate variables, mixed tenant/location/date/provider identity, invalid
    timestamps and non-canonical units are rejected. No gap filling occurs.
    """
    rows = list(observations)
    if not rows:
        raise ValueError("at least one normalized weather observation is required")
    if any(not isinstance(row, NormalizedEnvironmentalObservation) for row in rows):
        raise ValueError("all inputs must be normalized environmental observations")

    first = rows[0]
    if first.data_family != "weather":
        raise ValueError("daily FAO-56 indicators require weather observations")
    if first.observed_at.tzinfo is None or first.observed_at.utcoffset() is None:
        raise ValueError("observed_at must include a valid timezone")
    if first.observed_at.date() != first.observed_date:
        raise ValueError("observed_at date does not match observed_date")

    identity = (
        first.organization_id,
        first.location_id,
        first.observed_date,
        first.provider_code,
        first.dataset_code,
        first.source_time_standard,
    )
    for row in rows:
        if row.data_family != "weather":
            raise ValueError("daily FAO-56 indicators require weather observations")
        if row.observed_at.tzinfo is None or row.observed_at.utcoffset() is None:
            raise ValueError("observed_at must include a valid timezone")
        if row.observed_at.date() != row.observed_date:
            raise ValueError("observed_at date does not match observed_date")
        row_identity = (
            row.organization_id,
            row.location_id,
            row.observed_date,
            row.provider_code,
            row.dataset_code,
            row.source_time_standard,
        )
        if row_identity != identity:
            raise ValueError(
                "daily observations must share organization, location, date, "
                "provider, dataset and time-standard identity"
            )

    selected: dict[str, NormalizedEnvironmentalObservation] = {}
    for row in rows:
        if row.variable_code not in _REQUIRED_UNITS:
            continue
        if row.variable_code in selected:
            raise ValueError(
                f"duplicate required variable: {row.variable_code}"
            )
        expected_unit = _REQUIRED_UNITS[row.variable_code]
        if row.unit != expected_unit:
            raise ValueError(
                f"{row.variable_code} must use canonical unit {expected_unit}"
            )
        if (
            isinstance(row.value, bool)
            or not isinstance(row.value, (int, float))
            or not isfinite(row.value)
        ):
            raise ValueError(f"{row.variable_code} value must be finite and numeric")
        selected[row.variable_code] = row

    missing = tuple(
        variable for variable in _REQUIRED_UNITS if variable not in selected
    )
    source_ids = tuple(
        selected[variable].source_observation_id
        for variable in _REQUIRED_UNITS
        if variable in selected
    )
    source_variables = tuple(
        variable for variable in _REQUIRED_UNITS if variable in selected
    )
    if missing:
        return DailyReferenceIndicators(
            observed_date=first.observed_date,
            organization_id=first.organization_id,
            location_id=first.location_id,
            latitude_deg=latitude_deg,
            altitude_m=altitude_m,
            status="insufficient_data",
            source_observation_ids=source_ids,
            source_variable_codes=source_variables,
            missing_variables=missing,
            net_radiation=None,
            et0=None,
            formula_profiles=(),
            diagnostics=("missing_required_daily_weather_inputs",),
        )

    temperature_mean = selected["air_temperature_mean"].value
    temperature_max = selected["air_temperature_max"].value
    temperature_min = selected["air_temperature_min"].value
    wind_speed = selected["wind_speed_mean"].value
    solar_radiation = selected["solar_radiation_all_sky"].value
    relative_humidity = selected["relative_humidity_mean"].value

    actual_vapor_pressure = actual_vapor_pressure_from_mean_rh(
        temperature_max_c=temperature_max,
        temperature_min_c=temperature_min,
        relative_humidity_mean_percent=relative_humidity,
    )
    net_radiation = calculate_fao56_net_radiation(
        latitude_deg=latitude_deg,
        day_of_year=first.observed_date.timetuple().tm_yday,
        altitude_m=altitude_m,
        solar_radiation_mj_m2_day=solar_radiation,
        temperature_max_c=temperature_max,
        temperature_min_c=temperature_min,
        actual_vapor_pressure_kpa=actual_vapor_pressure,
    )
    et0 = calculate_fao56_et0(
        temperature_mean_c=temperature_mean,
        temperature_max_c=temperature_max,
        temperature_min_c=temperature_min,
        wind_speed_2m_m_s=wind_speed,
        net_radiation_mj_m2_day=net_radiation.net_radiation_mj_m2_day,
        altitude_m=altitude_m,
        relative_humidity_mean_percent=relative_humidity,
    )

    return DailyReferenceIndicators(
        observed_date=first.observed_date,
        organization_id=first.organization_id,
        location_id=first.location_id,
        latitude_deg=latitude_deg,
        altitude_m=altitude_m,
        status="available",
        source_observation_ids=source_ids,
        source_variable_codes=source_variables,
        missing_variables=(),
        net_radiation=net_radiation,
        et0=et0,
        formula_profiles=(
            net_radiation.formula_profile,
            et0.formula_profile,
        ),
        diagnostics=net_radiation.diagnostics + et0.diagnostics,
    )
