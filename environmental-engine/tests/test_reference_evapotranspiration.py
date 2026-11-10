import math

import pytest

from ba_environmental_engine.indicators.reference_evapotranspiration import (
    calculate_fao56_et0,
    saturation_vapor_pressure_kpa,
)


def test_fao56_daily_example_with_explicit_vapor_pressures():
    result = calculate_fao56_et0(
        temperature_mean_c=16.9,
        temperature_max_c=21.5,
        temperature_min_c=12.3,
        wind_speed_2m_m_s=2.078,
        net_radiation_mj_m2_day=8.19,
        atmospheric_pressure_kpa=99.1,
        actual_vapor_pressure_kpa=1.313,
    )

    assert result.reference_evapotranspiration_mm_day == pytest.approx(2.980, abs=0.002)
    assert result.saturation_vapor_pressure_kpa == pytest.approx(1.9975, abs=0.002)
    assert result.actual_vapor_pressure_kpa == pytest.approx(1.313)
    assert result.formula_profile == "fao56_penman_monteith_daily_v1"


def test_derives_pressure_from_explicit_altitude():
    by_pressure = calculate_fao56_et0(
        temperature_mean_c=20.0,
        temperature_max_c=25.0,
        temperature_min_c=15.0,
        wind_speed_2m_m_s=2.0,
        net_radiation_mj_m2_day=10.0,
        atmospheric_pressure_kpa=90.0,
        actual_vapor_pressure_kpa=1.2,
    )
    by_altitude = calculate_fao56_et0(
        temperature_mean_c=20.0,
        temperature_max_c=25.0,
        temperature_min_c=15.0,
        wind_speed_2m_m_s=2.0,
        net_radiation_mj_m2_day=10.0,
        altitude_m=988.0,
        actual_vapor_pressure_kpa=1.2,
    )

    assert by_altitude.atmospheric_pressure_kpa == pytest.approx(90.0, abs=0.2)
    assert by_altitude.reference_evapotranspiration_mm_day == pytest.approx(
        by_pressure.reference_evapotranspiration_mm_day, abs=0.02
    )


def test_derives_actual_vapor_pressure_from_daily_relative_humidity_extremes():
    result = calculate_fao56_et0(
        temperature_mean_c=20.0,
        temperature_max_c=25.0,
        temperature_min_c=15.0,
        wind_speed_2m_m_s=2.0,
        net_radiation_mj_m2_day=10.0,
        atmospheric_pressure_kpa=90.0,
        relative_humidity_min_percent=40.0,
        relative_humidity_max_percent=80.0,
    )

    expected = (
        saturation_vapor_pressure_kpa(15.0) * 0.80
        + saturation_vapor_pressure_kpa(25.0) * 0.40
    ) / 2
    assert result.actual_vapor_pressure_kpa == pytest.approx(expected)


def test_zero_wind_is_valid_and_result_is_finite():
    result = calculate_fao56_et0(
        temperature_mean_c=20.0,
        temperature_max_c=25.0,
        temperature_min_c=15.0,
        wind_speed_2m_m_s=0.0,
        net_radiation_mj_m2_day=10.0,
        atmospheric_pressure_kpa=90.0,
        actual_vapor_pressure_kpa=1.2,
    )
    assert math.isfinite(result.reference_evapotranspiration_mm_day)


@pytest.mark.parametrize(
    "changes",
    [
        {"temperature_max_c": 10.0},
        {"wind_speed_2m_m_s": -0.1},
        {"net_radiation_mj_m2_day": math.inf},
        {"atmospheric_pressure_kpa": 0.0},
        {"altitude_m": 100.0},
        {"relative_humidity_min_percent": 40.0},
        {"relative_humidity_min_percent": 40.0, "relative_humidity_max_percent": 80.0,
         "actual_vapor_pressure_kpa": 1.0},
        {"actual_vapor_pressure_kpa": -0.1},
    ],
)
def test_rejects_invalid_or_ambiguous_inputs(changes):
    arguments = dict(
        temperature_mean_c=20.0,
        temperature_max_c=25.0,
        temperature_min_c=15.0,
        wind_speed_2m_m_s=2.0,
        net_radiation_mj_m2_day=10.0,
        atmospheric_pressure_kpa=90.0,
        actual_vapor_pressure_kpa=1.2,
    )
    arguments.update(changes)
    with pytest.raises(ValueError):
        calculate_fao56_et0(**arguments)


def test_rejects_missing_pressure_or_altitude():
    with pytest.raises(ValueError, match="altitude_m or atmospheric_pressure_kpa"):
        calculate_fao56_et0(
            temperature_mean_c=20.0,
            temperature_max_c=25.0,
            temperature_min_c=15.0,
            wind_speed_2m_m_s=2.0,
            net_radiation_mj_m2_day=10.0,
            actual_vapor_pressure_kpa=1.2,
        )


def test_derives_actual_vapor_pressure_from_dew_point():
    result = calculate_fao56_et0(
        temperature_mean_c=20.0,
        temperature_max_c=25.0,
        temperature_min_c=15.0,
        wind_speed_2m_m_s=2.0,
        net_radiation_mj_m2_day=10.0,
        atmospheric_pressure_kpa=90.0,
        dew_point_temperature_c=10.0,
    )
    assert result.actual_vapor_pressure_kpa == pytest.approx(
        saturation_vapor_pressure_kpa(10.0)
    )


def test_negative_et0_is_retained_and_flagged_not_clamped():
    result = calculate_fao56_et0(
        temperature_mean_c=5.0,
        temperature_max_c=8.0,
        temperature_min_c=2.0,
        wind_speed_2m_m_s=0.0,
        net_radiation_mj_m2_day=-5.0,
        atmospheric_pressure_kpa=90.0,
        actual_vapor_pressure_kpa=0.5,
    )
    assert result.reference_evapotranspiration_mm_day < 0
    assert "negative_reference_et_review_energy_balance_inputs" in result.diagnostics


def test_derives_actual_vapor_pressure_from_mean_relative_humidity():
    result = calculate_fao56_et0(
        temperature_mean_c=20.0,
        temperature_max_c=25.0,
        temperature_min_c=15.0,
        wind_speed_2m_m_s=2.0,
        net_radiation_mj_m2_day=10.0,
        altitude_m=988.0,
        relative_humidity_mean_percent=60.0,
    )
    expected_saturation = (
        saturation_vapor_pressure_kpa(15.0)
        + saturation_vapor_pressure_kpa(25.0)
    ) / 2.0
    assert result.actual_vapor_pressure_kpa == pytest.approx(expected_saturation * 0.6)
