import math

import pytest

from ba_environmental_engine.indicators.net_radiation import (
    calculate_fao56_net_radiation,
    extraterrestrial_radiation_mj_m2_day,
)


def test_extraterrestrial_radiation_at_equator_near_equinox():
    result = extraterrestrial_radiation_mj_m2_day(
        latitude_deg=0.0,
        day_of_year=81,
    )
    assert result == pytest.approx(37.804, abs=0.01)


def test_calculates_daily_fao56_net_radiation_components():
    result = calculate_fao56_net_radiation(
        latitude_deg=45.0,
        day_of_year=172,
        altitude_m=100.0,
        solar_radiation_mj_m2_day=20.0,
        temperature_max_c=25.0,
        temperature_min_c=15.0,
        actual_vapor_pressure_kpa=1.5,
    )

    assert result.extraterrestrial_radiation_mj_m2_day == pytest.approx(41.9105, abs=0.001)
    assert result.clear_sky_radiation_mj_m2_day == pytest.approx(31.5167, abs=0.001)
    assert result.net_shortwave_radiation_mj_m2_day == pytest.approx(15.4)
    assert result.net_longwave_radiation_mj_m2_day == pytest.approx(3.0979, abs=0.002)
    assert result.net_radiation_mj_m2_day == pytest.approx(12.3021, abs=0.002)
    assert result.formula_profile == "fao56_daily_net_radiation_v1"


def test_caps_cloudiness_ratio_to_fao56_lower_and_upper_bounds():
    low = calculate_fao56_net_radiation(
        latitude_deg=45.0,
        day_of_year=172,
        altitude_m=100.0,
        solar_radiation_mj_m2_day=0.0,
        temperature_max_c=25.0,
        temperature_min_c=15.0,
        actual_vapor_pressure_kpa=1.5,
    )
    high = calculate_fao56_net_radiation(
        latitude_deg=45.0,
        day_of_year=172,
        altitude_m=100.0,
        solar_radiation_mj_m2_day=50.0,
        temperature_max_c=25.0,
        temperature_min_c=15.0,
        actual_vapor_pressure_kpa=1.5,
    )

    assert low.raw_solar_clear_sky_ratio == 0.0
    assert low.effective_solar_clear_sky_ratio == pytest.approx(0.3)
    assert "cloudiness_ratio_clamped_low" in low.diagnostics
    assert high.raw_solar_clear_sky_ratio > 1.0
    assert high.effective_solar_clear_sky_ratio == 1.0
    assert "cloudiness_ratio_clamped_high" in high.diagnostics


@pytest.mark.parametrize(
    "changes",
    [
        {"latitude_deg": 91.0},
        {"day_of_year": 0},
        {"day_of_year": 367},
        {"altitude_m": 9500.0},
        {"solar_radiation_mj_m2_day": -0.1},
        {"temperature_max_c": 10.0},
        {"actual_vapor_pressure_kpa": -0.1},
        {"actual_vapor_pressure_kpa": math.inf},
    ],
)
def test_rejects_invalid_inputs(changes):
    arguments = dict(
        latitude_deg=45.0,
        day_of_year=172,
        altitude_m=100.0,
        solar_radiation_mj_m2_day=20.0,
        temperature_max_c=25.0,
        temperature_min_c=15.0,
        actual_vapor_pressure_kpa=1.5,
    )
    arguments.update(changes)
    with pytest.raises(ValueError):
        calculate_fao56_net_radiation(**arguments)


def test_polar_night_is_reported_as_unsupported_for_daily_cloudiness_formula():
    with pytest.raises(ValueError, match="clear-sky radiation is zero"):
        calculate_fao56_net_radiation(
            latitude_deg=89.0,
            day_of_year=355,
            altitude_m=0.0,
            solar_radiation_mj_m2_day=0.0,
            temperature_max_c=-5.0,
            temperature_min_c=-15.0,
            actual_vapor_pressure_kpa=0.1,
        )
