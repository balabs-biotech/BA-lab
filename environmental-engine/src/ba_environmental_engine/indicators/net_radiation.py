"""FAO-56 daily net radiation and solar-geometry calculations."""

from dataclasses import dataclass
from math import acos, cos, isfinite, pi, radians, sin, sqrt, tan


FORMULA_PROFILE = "fao56_daily_net_radiation_v1"
SOLAR_CONSTANT_MJ_M2_MIN = 0.0820
STEFAN_BOLTZMANN_MJ_K4_M2_DAY = 4.903e-9


@dataclass(frozen=True, slots=True)
class FAO56NetRadiationResult:
    """Daily radiation balance and intermediate terms with explicit units."""

    extraterrestrial_radiation_mj_m2_day: float
    clear_sky_radiation_mj_m2_day: float
    raw_solar_clear_sky_ratio: float
    effective_solar_clear_sky_ratio: float
    net_shortwave_radiation_mj_m2_day: float
    net_longwave_radiation_mj_m2_day: float
    net_radiation_mj_m2_day: float
    altitude_m: float
    latitude_deg: float
    day_of_year: int
    solar_radiation_mj_m2_day: float
    albedo: float
    actual_vapor_pressure_kpa: float
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


def _validate_day(day_of_year: int) -> int:
    if isinstance(day_of_year, bool) or not isinstance(day_of_year, int):
        raise ValueError("day_of_year must be an integer")
    if not 1 <= day_of_year <= 366:
        raise ValueError("day_of_year must be between 1 and 366")
    return day_of_year


def _solar_geometry(latitude_deg: float, day_of_year: int) -> tuple[float, float]:
    """Return extraterrestrial radiation (MJ m-2 day-1) and sunset angle (rad)."""
    latitude = _finite_number("latitude_deg", latitude_deg)
    if not -90.0 <= latitude <= 90.0:
        raise ValueError("latitude_deg must be between -90 and 90 degrees")
    day = _validate_day(day_of_year)

    phi = radians(latitude)
    inverse_relative_distance = 1.0 + 0.033 * cos(2.0 * pi * day / 365.0)
    solar_declination = 0.409 * sin(2.0 * pi * day / 365.0 - 1.39)

    sunset_argument = -tan(phi) * tan(solar_declination)
    sunset_argument = max(-1.0, min(1.0, sunset_argument))
    sunset_hour_angle = acos(sunset_argument)

    extraterrestrial = (
        (24.0 * 60.0 / pi)
        * SOLAR_CONSTANT_MJ_M2_MIN
        * inverse_relative_distance
        * (
            sunset_hour_angle * sin(phi) * sin(solar_declination)
            + cos(phi) * cos(solar_declination) * sin(sunset_hour_angle)
        )
    )
    # Floating-point round-off at polar boundaries can produce tiny negatives.
    return max(0.0, extraterrestrial), sunset_hour_angle


def extraterrestrial_radiation_mj_m2_day(
    *, latitude_deg: float, day_of_year: int
) -> float:
    """Calculate FAO-56 daily extraterrestrial radiation (Ra)."""
    radiation, _ = _solar_geometry(latitude_deg, day_of_year)
    return radiation


def calculate_fao56_net_radiation(
    *,
    latitude_deg: float,
    day_of_year: int,
    altitude_m: float,
    solar_radiation_mj_m2_day: float,
    temperature_max_c: float,
    temperature_min_c: float,
    actual_vapor_pressure_kpa: float,
    albedo: float = 0.23,
) -> FAO56NetRadiationResult:
    """Calculate daily net radiation (Rn) using FAO-56 Eqs. 37- net longwave.

    Inputs must already be normalized to the stated units. Solar radiation
    (Rs) is incoming shortwave radiation, not net radiation. The FAO-56
    cloudiness ratio Rs/Rso is bounded to [0.3, 1.0] for the longwave term.
    """
    latitude = _finite_number("latitude_deg", latitude_deg)
    if not -90.0 <= latitude <= 90.0:
        raise ValueError("latitude_deg must be between -90 and 90 degrees")
    day = _validate_day(day_of_year)
    altitude = _finite_number("altitude_m", altitude_m)
    if not -500.0 <= altitude <= 9000.0:
        raise ValueError("altitude_m must be between -500 and 9000 metres")

    solar_radiation = _finite_number(
        "solar_radiation_mj_m2_day", solar_radiation_mj_m2_day
    )
    t_max = _finite_number("temperature_max_c", temperature_max_c)
    t_min = _finite_number("temperature_min_c", temperature_min_c)
    actual_vapor_pressure = _finite_number(
        "actual_vapor_pressure_kpa", actual_vapor_pressure_kpa
    )
    surface_albedo = _finite_number("albedo", albedo)

    if solar_radiation < 0:
        raise ValueError("solar_radiation_mj_m2_day must be non-negative")
    if t_min > t_max:
        raise ValueError("temperature_min_c must be on or below temperature_max_c")
    if t_min <= -273.16:
        raise ValueError("temperature_min_c is below absolute zero")
    if actual_vapor_pressure < 0:
        raise ValueError("actual_vapor_pressure_kpa must be non-negative")
    if not 0.0 <= surface_albedo < 1.0:
        raise ValueError("albedo must be in [0, 1)")

    extraterrestrial, _ = _solar_geometry(latitude, day)
    clear_sky = (0.75 + 2.0e-5 * altitude) * extraterrestrial
    if clear_sky <= 0.0:
        raise ValueError(
            "clear-sky radiation is zero for this location and date; "
            "daily FAO-56 cloudiness correction is not defined"
        )

    raw_ratio = solar_radiation / clear_sky
    effective_ratio = min(1.0, max(0.3, raw_ratio))
    diagnostics: list[str] = []
    if raw_ratio < 0.3:
        diagnostics.append("cloudiness_ratio_clamped_low")
    if raw_ratio > 1.0:
        diagnostics.append("cloudiness_ratio_clamped_high")

    kelvin_max = t_max + 273.16
    kelvin_min = t_min + 273.16
    if kelvin_min <= 0.0:
        raise ValueError("temperature_min_c is below absolute zero")
    mean_fourth_power_temperature = (
        kelvin_max**4 + kelvin_min**4
    ) / 2.0

    net_shortwave = (1.0 - surface_albedo) * solar_radiation
    net_longwave = (
        STEFAN_BOLTZMANN_MJ_K4_M2_DAY
        * mean_fourth_power_temperature
        * (0.34 - 0.14 * sqrt(actual_vapor_pressure))
        * (1.35 * effective_ratio - 0.35)
    )
    net_radiation = net_shortwave - net_longwave
    if not all(isfinite(value) for value in (
        extraterrestrial, clear_sky, raw_ratio, net_shortwave, net_longwave, net_radiation
    )):
        raise ValueError("FAO-56 radiation calculation produced a non-finite result")

    return FAO56NetRadiationResult(
        extraterrestrial_radiation_mj_m2_day=extraterrestrial,
        clear_sky_radiation_mj_m2_day=clear_sky,
        raw_solar_clear_sky_ratio=raw_ratio,
        effective_solar_clear_sky_ratio=effective_ratio,
        net_shortwave_radiation_mj_m2_day=net_shortwave,
        net_longwave_radiation_mj_m2_day=net_longwave,
        net_radiation_mj_m2_day=net_radiation,
        altitude_m=altitude,
        latitude_deg=latitude,
        day_of_year=day,
        solar_radiation_mj_m2_day=solar_radiation,
        albedo=surface_albedo,
        actual_vapor_pressure_kpa=actual_vapor_pressure,
        diagnostics=tuple(diagnostics),
    )
