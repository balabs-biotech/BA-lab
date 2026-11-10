import math

import pytest

from ba_environmental_engine.units import registry


def test_temperature_kelvin_is_converted_to_celsius():
    result = registry.canonicalize_variable_value("air_temperature_mean", 293.15, "K")
    assert result.value == pytest.approx(20.0)
    assert result.unit == "degC"
    assert result.original_value == 293.15
    assert result.original_unit == "K"


def test_wind_kilometres_per_hour_is_converted_to_metres_per_second():
    result = registry.canonicalize_variable_value("wind_speed_mean", 36.0, "km/h")
    assert result.value == pytest.approx(10.0)
    assert result.unit == "m/s"


def test_precipitation_mass_per_area_is_water_depth_equivalent():
    result = registry.canonicalize_variable_value("precipitation_corrected", 12.0, "kg/m2")
    assert result.value == pytest.approx(12.0)
    assert result.unit == "mm"


def test_solar_energy_converts_mj_to_kwh():
    assert registry.convert_unit(3.6, "MJ/m2", "kWh/m2") == pytest.approx(1.0)


def test_pressure_converts_kpa_to_hpa():
    assert registry.convert_unit(100.0, "kPa", "hPa") == pytest.approx(1000.0)


def test_unknown_variable_is_rejected():
    with pytest.raises(ValueError, match="unknown canonical variable"):
        registry.canonicalize_variable_value("mystery", 1.0, "mm")


def test_dimension_mismatch_is_rejected():
    with pytest.raises(ValueError, match="incompatible units"):
        registry.convert_unit(1.0, "degC", "mm")


def test_unknown_unit_is_rejected():
    with pytest.raises(ValueError, match="unsupported unit"):
        registry.convert_unit(1.0, "degree-ish", "degC")


def test_non_finite_values_are_rejected():
    with pytest.raises(ValueError, match="finite"):
        registry.convert_unit(math.nan, "degC", "degC")


def test_variable_rejects_valid_but_wrong_dimension():
    with pytest.raises(ValueError, match="not valid for variable"):
        registry.canonicalize_variable_value("air_temperature_mean", 10.0, "mm")


def test_relative_humidity_fraction_is_converted_to_percent():
    result = registry.canonicalize_variable_value("relative_humidity_mean", 0.65, "fraction")
    assert result.value == pytest.approx(65.0)
    assert result.unit == "%"
