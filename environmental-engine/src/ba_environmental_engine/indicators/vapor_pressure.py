"""Psychrometric indicators derived from air temperature and relative humidity."""

from dataclasses import dataclass
from math import exp, isfinite


@dataclass(frozen=True, slots=True)
class VPDResult:
    """Vapor-pressure deficit with its input values and formula provenance."""

    temperature_c: float
    relative_humidity_percent: float
    saturation_vapor_pressure_kpa: float
    actual_vapor_pressure_kpa: float
    vpd_kpa: float
    formula_profile: str = "tetens_fao56_v1"


def calculate_vpd(
    *,
    temperature_c: float,
    relative_humidity_percent: float,
) -> VPDResult:
    """Calculate VPD in kPa from air temperature (°C) and RH (%).

    Saturation vapor pressure follows the FAO-56 Tetens approximation:
    es = 0.6108 * exp(17.27 * T / (T + 237.3)).
    """
    for name, value in (
        ("temperature_c", temperature_c),
        ("relative_humidity_percent", relative_humidity_percent),
    ):
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not isfinite(value)
        ):
            raise ValueError(f"{name} must be a finite numeric value")

    if temperature_c <= -237.3:
        raise ValueError("temperature_c is outside the valid Tetens formula domain")
    if not 0.0 <= relative_humidity_percent <= 100.0:
        raise ValueError("relative_humidity_percent must be between 0 and 100")

    saturation = 0.6108 * exp(
        (17.27 * float(temperature_c)) / (float(temperature_c) + 237.3)
    )
    actual = saturation * (float(relative_humidity_percent) / 100.0)
    deficit = saturation - actual

    return VPDResult(
        temperature_c=float(temperature_c),
        relative_humidity_percent=float(relative_humidity_percent),
        saturation_vapor_pressure_kpa=saturation,
        actual_vapor_pressure_kpa=actual,
        vpd_kpa=deficit,
    )


def saturation_vapor_pressure_kpa(temperature_c: float) -> float:
    """Saturation vapour pressure in kPa using the FAO-56 Tetens equation."""
    if (
        isinstance(temperature_c, bool)
        or not isinstance(temperature_c, (int, float))
        or not isfinite(temperature_c)
    ):
        raise ValueError("temperature_c must be a finite numeric value")
    if temperature_c <= -237.3:
        raise ValueError("temperature_c is outside the valid FAO-56 formula domain")
    return 0.6108 * exp(
        (17.27 * float(temperature_c)) / (float(temperature_c) + 237.3)
    )


def actual_vapor_pressure_from_mean_rh(
    *,
    temperature_max_c: float,
    temperature_min_c: float,
    relative_humidity_mean_percent: float,
) -> float:
    """Estimate daily actual vapour pressure from FAO-56 mean RH (Eq. 19)."""
    saturation_max = saturation_vapor_pressure_kpa(temperature_max_c)
    saturation_min = saturation_vapor_pressure_kpa(temperature_min_c)
    if temperature_min_c > temperature_max_c:
        raise ValueError("temperature_min_c must be on or below temperature_max_c")
    if (
        isinstance(relative_humidity_mean_percent, bool)
        or not isinstance(relative_humidity_mean_percent, (int, float))
        or not isfinite(relative_humidity_mean_percent)
        or not 0.0 <= relative_humidity_mean_percent <= 100.0
    ):
        raise ValueError("relative_humidity_mean_percent must be between 0 and 100")
    mean_saturation = (saturation_max + saturation_min) / 2.0
    return mean_saturation * (float(relative_humidity_mean_percent) / 100.0)
