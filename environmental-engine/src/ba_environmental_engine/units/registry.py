"""Explicit, deterministic unit conversions for supported climate variables."""

from dataclasses import dataclass
from math import isfinite
from typing import Final


@dataclass(frozen=True, slots=True)
class UnitDefinition:
    dimension: str
    scale: float
    offset: float = 0.0


@dataclass(frozen=True, slots=True)
class NormalizedValue:
    """Canonical value plus the exact source representation used."""

    value: float
    unit: str
    original_value: float
    original_unit: str


# Each unit maps to a common base unit for its physical dimension.
# Temperature base: kelvin; pressure base: pascal; energy/area base: MJ/m².
_UNITS: Final[dict[str, UnitDefinition]] = {
    "K": UnitDefinition("temperature", 1.0),
    "degC": UnitDefinition("temperature", 1.0, 273.15),
    "m/s": UnitDefinition("speed", 1.0),
    "km/h": UnitDefinition("speed", 1.0 / 3.6),
    "mm": UnitDefinition("water_depth", 1.0),
    # For liquid-water precipitation, 1 kg/m² is equivalent to 1 mm water depth.
    "kg/m2": UnitDefinition("water_depth", 1.0),
    "MJ/m2": UnitDefinition("energy_area", 1.0),
    "kWh/m2": UnitDefinition("energy_area", 3.6),
    "%": UnitDefinition("ratio", 0.01),
    "fraction": UnitDefinition("ratio", 1.0),
    "Pa": UnitDefinition("pressure", 1.0),
    "hPa": UnitDefinition("pressure", 100.0),
    "kPa": UnitDefinition("pressure", 1000.0),
}

_VARIABLES: Final[dict[str, tuple[str, str]]] = {
    "air_temperature_mean": ("temperature", "degC"),
    "air_temperature_max": ("temperature", "degC"),
    "air_temperature_min": ("temperature", "degC"),
    "wind_speed_mean": ("speed", "m/s"),
    "relative_humidity_mean": ("ratio", "%"),
    "precipitation_corrected": ("water_depth", "mm"),
    "solar_radiation_all_sky": ("energy_area", "MJ/m2"),
    "surface_pressure": ("pressure", "Pa"),
}


def convert_unit(value: float, source_unit: str, target_unit: str) -> float:
    """Convert between explicitly supported units of the same dimension."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
        raise ValueError("value must be a finite number")
    try:
        source = _UNITS[source_unit]
    except KeyError as error:
        raise ValueError(f"unsupported unit: {source_unit}") from error
    try:
        target = _UNITS[target_unit]
    except KeyError as error:
        raise ValueError(f"unsupported unit: {target_unit}") from error
    if source.dimension != target.dimension:
        raise ValueError(
            f"incompatible units: {source_unit} cannot be converted to {target_unit}"
        )
    base_value = float(value) * source.scale + source.offset
    converted = (base_value - target.offset) / target.scale
    if not isfinite(converted):
        raise ValueError("converted value is not finite")
    return converted


def canonicalize_variable_value(
    variable_code: str, value: float, source_unit: str
) -> NormalizedValue:
    """Convert a supported source variable to its registered canonical unit."""
    try:
        dimension, canonical_unit = _VARIABLES[variable_code]
    except KeyError as error:
        raise ValueError(f"unknown canonical variable: {variable_code}") from error
    try:
        source = _UNITS[source_unit]
    except KeyError as error:
        raise ValueError(f"unsupported unit: {source_unit}") from error
    if source.dimension != dimension:
        raise ValueError(f"unit {source_unit} is not valid for variable {variable_code}")
    return NormalizedValue(
        value=convert_unit(value, source_unit, canonical_unit),
        unit=canonical_unit,
        original_value=float(value),
        original_unit=source_unit,
    )
