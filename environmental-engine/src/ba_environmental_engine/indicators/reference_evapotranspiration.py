"""FAO-56 daily reference evapotranspiration (ET0).

This module implements the standardized Penman-Monteith equation. It accepts
net radiation and meteorological inputs that have already been normalized by
an upstream adapter. It does not fetch weather, infer altitude, or estimate
net radiation from solar radiation.
"""

from dataclasses import dataclass
from math import isfinite

from ba_environmental_engine.indicators.vapor_pressure import (
    actual_vapor_pressure_from_mean_rh,
    saturation_vapor_pressure_kpa,
)


FORMULA_PROFILE = "fao56_penman_monteith_daily_v1"


@dataclass(frozen=True, slots=True)
class FAO56ET0Result:
    """Reproducible daily ET0 result and its principal derived terms."""

    reference_evapotranspiration_mm_day: float
    saturation_vapor_pressure_kpa: float
    actual_vapor_pressure_kpa: float
    vapor_pressure_deficit_kpa: float
    slope_saturation_vapor_pressure_kpa_c: float
    psychrometric_constant_kpa_c: float
    atmospheric_pressure_kpa: float
    wind_speed_2m_m_s: float
    net_radiation_mj_m2_day: float
    soil_heat_flux_mj_m2_day: float
    formula_profile: str = FORMULA_PROFILE
    diagnostics: tuple[str, ...] = ()


def _finite_number(name: str, value: float) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not isfinite(value)
    ):
        raise ValueError(f"{name} must be a finite numeric value")
    return float(value)


def atmospheric_pressure_from_altitude_kpa(altitude_m: float) -> float:
    """Estimate mean atmospheric pressure from altitude using FAO-56 Eq. 7."""
    altitude = _finite_number("altitude_m", altitude_m)
    if not -500.0 <= altitude <= 9000.0:
        raise ValueError("altitude_m must be between -500 and 9000 metres")
    base = (293.0 - 0.0065 * altitude) / 293.0
    if base <= 0:
        raise ValueError("altitude_m is outside the atmospheric pressure model domain")
    return 101.3 * (base**5.26)


def _actual_vapor_pressure(
    *,
    temperature_max_c: float,
    temperature_min_c: float,
    saturation_min_kpa: float,
    saturation_max_kpa: float,
    actual_vapor_pressure_kpa: float | None,
    relative_humidity_mean_percent: float | None,
    relative_humidity_min_percent: float | None,
    relative_humidity_max_percent: float | None,
    dew_point_temperature_c: float | None,
) -> float:
    direct = actual_vapor_pressure_kpa is not None
    humidity_mean = relative_humidity_mean_percent is not None
    humidity_extremes = (
        relative_humidity_min_percent is not None
        or relative_humidity_max_percent is not None
    )
    humidity = humidity_mean or humidity_extremes
    dew_point = dew_point_temperature_c is not None

    if sum((direct, humidity, dew_point)) != 1:
        raise ValueError(
            "provide exactly one actual vapour pressure method: "
            "actual_vapor_pressure_kpa, mean relative humidity, both relative "
            "humidity extremes, or dew_point_temperature_c"
        )

    if direct:
        actual = _finite_number(
            "actual_vapor_pressure_kpa", actual_vapor_pressure_kpa
        )
        if actual < 0:
            raise ValueError("actual_vapor_pressure_kpa must be non-negative")
    elif dew_point:
        actual = saturation_vapor_pressure_kpa(dew_point_temperature_c)
    elif humidity_mean:
        actual = actual_vapor_pressure_from_mean_rh(
            temperature_max_c=temperature_max_c,
            temperature_min_c=temperature_min_c,
            relative_humidity_mean_percent=relative_humidity_mean_percent,
        )
    else:
        if (
            relative_humidity_min_percent is None
            or relative_humidity_max_percent is None
        ):
            raise ValueError(
                "both relative_humidity_min_percent and "
                "relative_humidity_max_percent are required"
            )
        rh_min = _finite_number(
            "relative_humidity_min_percent", relative_humidity_min_percent
        )
        rh_max = _finite_number(
            "relative_humidity_max_percent", relative_humidity_max_percent
        )
        if not 0.0 <= rh_min <= 100.0 or not 0.0 <= rh_max <= 100.0:
            raise ValueError("relative humidity values must be between 0 and 100")
        actual = (
            saturation_min_kpa * (rh_max / 100.0)
            + saturation_max_kpa * (rh_min / 100.0)
        ) / 2.0

    if actual > saturation_max_kpa:
        raise ValueError(
            "actual vapour pressure exceeds saturation pressure at Tmax; "
            "check humidity, dew point, and temperature inputs"
        )
    return actual


def calculate_fao56_et0(
    *,
    temperature_mean_c: float,
    temperature_max_c: float,
    temperature_min_c: float,
    wind_speed_2m_m_s: float,
    net_radiation_mj_m2_day: float,
    atmospheric_pressure_kpa: float | None = None,
    altitude_m: float | None = None,
    actual_vapor_pressure_kpa: float | None = None,
    relative_humidity_mean_percent: float | None = None,
    relative_humidity_min_percent: float | None = None,
    relative_humidity_max_percent: float | None = None,
    dew_point_temperature_c: float | None = None,
    soil_heat_flux_mj_m2_day: float = 0.0,
) -> FAO56ET0Result:
    """Calculate daily reference ET0 in mm/day using FAO-56 Eq. 6.

    Exactly one of atmospheric pressure or station altitude is required.
    Actual vapour pressure must be supplied directly, derived from mean daily
    RH, derived from both daily RH extremes, or derived from dew-point
    temperature. Net radiation is
    required as a precomputed daily value (MJ m-2 day-1); no solar-to-net
    radiation approximation is made here.

    For daily calculations, soil heat flux defaults to 0 MJ m-2 day-1 as in
    the FAO-56 daily formulation. The calculated ET0 is not clamped at zero;
    negative outputs are retained and flagged for scientific review.
    """
    t_mean = _finite_number("temperature_mean_c", temperature_mean_c)
    t_max = _finite_number("temperature_max_c", temperature_max_c)
    t_min = _finite_number("temperature_min_c", temperature_min_c)
    wind = _finite_number("wind_speed_2m_m_s", wind_speed_2m_m_s)
    net_radiation = _finite_number(
        "net_radiation_mj_m2_day", net_radiation_mj_m2_day
    )
    soil_heat_flux = _finite_number(
        "soil_heat_flux_mj_m2_day", soil_heat_flux_mj_m2_day
    )

    for name, temperature in (
        ("temperature_mean_c", t_mean),
        ("temperature_max_c", t_max),
        ("temperature_min_c", t_min),
    ):
        if temperature <= -237.3:
            raise ValueError(f"{name} is outside the valid FAO-56 formula domain")
    if t_min > t_max or not t_min <= t_mean <= t_max:
        raise ValueError("temperature_mean_c must lie between Tmin and Tmax")
    if wind < 0:
        raise ValueError("wind_speed_2m_m_s must be non-negative")

    if (atmospheric_pressure_kpa is None) == (altitude_m is None):
        raise ValueError(
            "provide exactly one of altitude_m or atmospheric_pressure_kpa"
        )
    if altitude_m is not None:
        pressure = atmospheric_pressure_from_altitude_kpa(altitude_m)
    else:
        pressure = _finite_number(
            "atmospheric_pressure_kpa", atmospheric_pressure_kpa
        )
        if not 0.0 < pressure <= 110.0:
            raise ValueError("atmospheric_pressure_kpa must be in (0, 110]")

    saturation_min = saturation_vapor_pressure_kpa(t_min)
    saturation_max = saturation_vapor_pressure_kpa(t_max)
    saturation_mean = (saturation_min + saturation_max) / 2.0
    actual = _actual_vapor_pressure(
        temperature_max_c=t_max,
        temperature_min_c=t_min,
        saturation_min_kpa=saturation_min,
        saturation_max_kpa=saturation_max,
        actual_vapor_pressure_kpa=actual_vapor_pressure_kpa,
        relative_humidity_mean_percent=relative_humidity_mean_percent,
        relative_humidity_min_percent=relative_humidity_min_percent,
        relative_humidity_max_percent=relative_humidity_max_percent,
        dew_point_temperature_c=dew_point_temperature_c,
    )
    deficit = saturation_mean - actual
    if deficit < 0:
        raise ValueError("actual vapour pressure cannot exceed mean saturation pressure")

    mean_saturation = saturation_vapor_pressure_kpa(t_mean)
    slope = (
        4098.0 * mean_saturation / ((t_mean + 237.3) ** 2)
    )
    psychrometric = 0.000665 * pressure

    numerator = (
        0.408 * slope * (net_radiation - soil_heat_flux)
        + psychrometric
        * (900.0 / (t_mean + 273.0))
        * wind
        * deficit
    )
    denominator = slope + psychrometric * (1.0 + 0.34 * wind)
    if denominator <= 0 or not isfinite(denominator):
        raise ValueError("FAO-56 equation produced an invalid denominator")

    et0 = numerator / denominator
    if not isfinite(et0):
        raise ValueError("FAO-56 equation produced a non-finite ET0 result")

    diagnostics: tuple[str, ...] = ()
    if et0 < 0:
        diagnostics = ("negative_reference_et_review_energy_balance_inputs",)

    return FAO56ET0Result(
        reference_evapotranspiration_mm_day=et0,
        saturation_vapor_pressure_kpa=saturation_mean,
        actual_vapor_pressure_kpa=actual,
        vapor_pressure_deficit_kpa=deficit,
        slope_saturation_vapor_pressure_kpa_c=slope,
        psychrometric_constant_kpa_c=psychrometric,
        atmospheric_pressure_kpa=pressure,
        wind_speed_2m_m_s=wind,
        net_radiation_mj_m2_day=net_radiation,
        soil_heat_flux_mj_m2_day=soil_heat_flux,
        diagnostics=diagnostics,
    )
