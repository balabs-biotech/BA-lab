"""Strict NASA POWER daily-row adapter; no database writes occur here."""

from dataclasses import dataclass
from datetime import date, datetime
from math import isfinite
from typing import Any
from uuid import UUID

from ba_environmental_engine.sources.models import (
    DuplicateSourceKey,
    NormalizedEnvironmentalObservation,
    find_duplicate_source_keys,
)
from ba_environmental_engine.units.registry import canonicalize_variable_value


@dataclass(frozen=True, slots=True)
class NASAParameter:
    variable_code: str
    provider_unit: str
    conversion_unit: str


# The daily suffix is part of the provider's quantity semantics. For the
# daily precipitation total, mm/day is normalized as a daily depth in mm.
# For daily irradiation, kWh/m2/day is converted as kWh/m2 to MJ/m2.
NASA_POWER_DAILY_PARAMETERS: dict[str, NASAParameter] = {
    "T2M": NASAParameter("air_temperature_mean", "degC", "degC"),
    "T2M_MAX": NASAParameter("air_temperature_max", "degC", "degC"),
    "T2M_MIN": NASAParameter("air_temperature_min", "degC", "degC"),
    "PRECTOTCORR": NASAParameter("precipitation_corrected", "mm/day", "mm"),
    "ALLSKY_SFC_SW_DWN": NASAParameter(
        "solar_radiation_all_sky", "kWh/m2/day", "kWh/m2"
    ),
    "RH2M": NASAParameter("relative_humidity_mean", "%", "%"),
    "WS2M": NASAParameter("wind_speed_mean", "m/s", "m/s"),
}


def _aware_datetime(value: Any, field: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be an ISO-8601 string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{field} must be a valid ISO-8601 datetime") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{field} must include a timezone")
    return parsed


def normalize_nasa_power_observation(
    row: dict[str, Any],
) -> NormalizedEnvironmentalObservation:
    """Normalize one persisted NASA POWER row while retaining its provenance."""
    if not isinstance(row, dict):
        raise ValueError("observation row must be an object")
    if row.get("provider_code") != "NASA_POWER":
        raise ValueError("unsupported provider_code")
    if row.get("dataset_code") != "POWER_DAILY_AGRO":
        raise ValueError("unsupported dataset_code")

    if row.get("data_family") != "weather":
        raise ValueError("NASA POWER daily adapter only accepts weather observations")
    metadata = row.get("metadata")
    if not isinstance(metadata, dict):
        raise ValueError("metadata must be an object")
    spatial_resolution = row.get("spatial_resolution_m")
    if spatial_resolution is not None:
        if (
            isinstance(spatial_resolution, bool)
            or not isinstance(spatial_resolution, (int, float))
            or not isfinite(spatial_resolution)
            or spatial_resolution <= 0
        ):
            raise ValueError("spatial_resolution_m must be a positive finite number or null")
    parameter_code = metadata.get("source_parameter")
    if not isinstance(parameter_code, str):
        raise ValueError("metadata.source_parameter must be a string")
    parameter = NASA_POWER_DAILY_PARAMETERS.get(parameter_code)
    if parameter is None:
        raise ValueError("unsupported or missing NASA POWER source_parameter")

    if row.get("variable_code") != parameter.variable_code:
        raise ValueError("stored variable_code does not match source parameter")
    source_unit = row.get("unit_code")
    if source_unit != parameter.provider_unit:
        raise ValueError("stored unit_code does not match source parameter")

    source_value = row.get("value")
    if isinstance(source_value, bool) or not isinstance(source_value, (int, float)):
        raise ValueError("observation value must be numeric")
    if not isfinite(source_value):
        raise ValueError("observation value must be finite")

    observed_at = _aware_datetime(row.get("observed_at"), "observed_at")
    retrieved_at = _aware_datetime(row.get("retrieved_at"), "retrieved_at")
    source_date = metadata.get("source_date")
    if not isinstance(source_date, str):
        raise ValueError("metadata.source_date must be an ISO date")
    try:
        observed_date = date.fromisoformat(source_date)
    except ValueError as error:
        raise ValueError("metadata.source_date must be an ISO date") from error
    if observed_at.date() != observed_date:
        raise ValueError("observed_at date does not match metadata.source_date")

    time_standard = metadata.get("source_time_standard")
    if time_standard != "NASA POWER daily local solar time":
        raise ValueError("unsupported NASA POWER time standard")

    normalized = canonicalize_variable_value(
        parameter.variable_code, source_value, parameter.conversion_unit
    )
    quality_flag = row.get("quality_flag")
    if quality_flag is not None and not isinstance(quality_flag, str):
        raise ValueError("quality_flag must be a string or null")
    source_url = row.get("source_url")
    if source_url is not None and not isinstance(source_url, str):
        raise ValueError("source_url must be a string or null")

    try:
        source_id = UUID(str(row["id"]))
        organization_id = UUID(str(row["organization_id"]))
        location_id = UUID(str(row["location_id"]))
    except (KeyError, ValueError, TypeError) as error:
        raise ValueError("source and tenant identifiers must be valid UUIDs") from error

    return NormalizedEnvironmentalObservation(
        source_observation_id=source_id,
        organization_id=organization_id,
        location_id=location_id,
        data_family="weather",
        provider_code="NASA_POWER",
        dataset_code="POWER_DAILY_AGRO",
        source_parameter=parameter_code,
        variable_code=parameter.variable_code,
        value=normalized.value,
        unit=normalized.unit,
        source_value=float(source_value),
        source_unit=source_unit,
        observed_at=observed_at,
        observed_date=observed_date,
        retrieved_at=retrieved_at,
        spatial_resolution_m=float(spatial_resolution) if spatial_resolution is not None else None,
        quality_flag=quality_flag,
        source_url=source_url,
        source_time_standard=time_standard,
        source_metadata=dict(metadata),
    )
