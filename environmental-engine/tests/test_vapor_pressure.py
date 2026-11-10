import math

import pytest

from ba_environmental_engine.indicators.vapor_pressure import calculate_vpd


def test_calculates_vpd_from_air_temperature_and_relative_humidity():
    result = calculate_vpd(temperature_c=25.0, relative_humidity_percent=60.0)

    assert result.saturation_vapor_pressure_kpa == pytest.approx(3.1678, rel=2e-3)
    assert result.actual_vapor_pressure_kpa == pytest.approx(1.9007, rel=2e-3)
    assert result.vpd_kpa == pytest.approx(1.2671, rel=2e-3)
    assert result.formula_profile == "tetens_fao56_v1"


def test_saturated_air_has_zero_vpd():
    result = calculate_vpd(temperature_c=20.0, relative_humidity_percent=100.0)
    assert result.vpd_kpa == pytest.approx(0.0, abs=1e-12)


@pytest.mark.parametrize("temperature,rh", [(25.0, -1.0), (25.0, 100.1), (-237.3, 50.0)])
def test_rejects_invalid_physical_inputs(temperature, rh):
    with pytest.raises(ValueError):
        calculate_vpd(temperature_c=temperature, relative_humidity_percent=rh)


def test_rejects_non_finite_and_boolean_inputs():
    with pytest.raises(ValueError, match="finite"):
        calculate_vpd(temperature_c=math.nan, relative_humidity_percent=50.0)
    with pytest.raises(ValueError, match="finite"):
        calculate_vpd(temperature_c=20.0, relative_humidity_percent=True)


def test_preserves_input_values_and_does_not_mutate_them():
    temperature, humidity = 25.0, 60.0
    result = calculate_vpd(temperature_c=temperature, relative_humidity_percent=humidity)
    assert result.temperature_c == temperature
    assert result.relative_humidity_percent == humidity
