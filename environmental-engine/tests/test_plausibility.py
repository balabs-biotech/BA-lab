import pytest

from ba_environmental_engine.quality.plausibility import (
    assess_observation_plausibility,
)


@pytest.mark.parametrize(
    ("variable", "value", "expected_status", "expected_flag"),
    [
        ("relative_humidity_mean", 54.0, "valid", None),
        ("relative_humidity_mean", 104.0, "invalid", "outside_physical_bounds"),
        ("precipitation_corrected", -0.1, "invalid", "negative_value"),
        ("precipitation_corrected", 620.0, "suspect", "above_screening_threshold"),
        ("air_temperature_mean", 67.0, "suspect", "above_screening_threshold"),
        ("wind_speed_mean", 0.0, "valid", None),
    ],
)
def test_variable_specific_screening_returns_explicit_quality_status(
    variable, value, expected_status, expected_flag
):
    result = assess_observation_plausibility(variable, value)

    assert result.status == expected_status
    if expected_flag is None:
        assert result.flags == ()
    else:
        assert expected_flag in result.flags


def test_screening_never_modifies_the_observed_value():
    result = assess_observation_plausibility("precipitation_corrected", 620.0)

    assert result.original_value == 620.0
    assert result.evaluated_value == 620.0


def test_unknown_variable_is_not_silently_accepted():
    with pytest.raises(ValueError, match="unsupported variable"):
        assess_observation_plausibility("mystery_variable", 12.0)


@pytest.mark.parametrize("value", [True, float("nan"), float("inf"), "12"])
def test_rejects_non_finite_or_non_numeric_values(value):
    with pytest.raises(ValueError):
        assess_observation_plausibility("air_temperature_mean", value)
