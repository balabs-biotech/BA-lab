from datetime import date, timedelta

import pytest

from ba_environmental_engine.climate.windows import (
    calculate_rolling_climate_indicators,
)


def daily_series(end: date, count: int, value: float):
    return {
        end - timedelta(days=offset): value + offset
        for offset in range(count)
    }


def test_calculates_inclusive_7_14_30_and_90_day_windows():
    end = date(2026, 10, 31)
    result = calculate_rolling_climate_indicators(
        {
            "air_temperature_mean": daily_series(end, 90, 10.0),
            "precipitation_corrected": daily_series(end, 90, 1.0),
        },
        end_date=end,
        methods={
            "air_temperature_mean": "mean",
            "precipitation_corrected": "sum",
        },
        window_days=(7, 14, 30, 90),
        units={"air_temperature_mean": "degC", "precipitation_corrected": "mm"},
    )

    assert len(result) == 8
    by_key = {(item.variable_code, item.window_days): item for item in result}
    seven_day_temperature = by_key[("air_temperature_mean", 7)]
    assert seven_day_temperature.period_start == date(2026, 10, 25)
    assert seven_day_temperature.period_end == end
    assert seven_day_temperature.aggregation.value == pytest.approx(13.0)
    assert seven_day_temperature.aggregation.coverage.expected == 7
    assert seven_day_temperature.aggregation.coverage.observed == 7

    thirty_day_rain = by_key[("precipitation_corrected", 30)]
    assert thirty_day_rain.aggregation.value == pytest.approx(sum(range(1, 31)))
    assert thirty_day_rain.aggregation.unit == "mm"


def test_low_coverage_returns_insufficient_data_not_a_partial_precipitation_sum():
    end = date(2026, 10, 31)
    values = daily_series(end, 6, 1.0)

    result = calculate_rolling_climate_indicators(
        {"precipitation_corrected": values},
        end_date=end,
        methods={"precipitation_corrected": "sum"},
        window_days=(7,),
        minimum_coverage_ratio=1.0,
    )[0]

    assert result.aggregation.status == "insufficient_data"
    assert result.aggregation.value is None
    assert result.aggregation.coverage.observed == 6
    assert result.aggregation.coverage.expected == 7


def test_empty_variable_series_is_reported_as_insufficient_data():
    result = calculate_rolling_climate_indicators(
        {"air_temperature_mean": {}},
        end_date=date(2026, 10, 31),
        methods={"air_temperature_mean": "mean"},
        window_days=(7,),
    )[0]

    assert result.aggregation.status == "insufficient_data"
    assert result.aggregation.value is None
    assert result.aggregation.coverage.observed == 0


@pytest.mark.parametrize("windows", [(0,), (-7,), (7, 7), (True,), ()])
def test_rejects_invalid_window_definitions(windows):
    with pytest.raises(ValueError):
        calculate_rolling_climate_indicators(
            {"air_temperature_mean": {}},
            end_date=date(2026, 10, 31),
            methods={"air_temperature_mean": "mean"},
            window_days=windows,
        )


def test_rejects_mismatched_variable_and_method_catalogues():
    with pytest.raises(ValueError, match="same variable codes"):
        calculate_rolling_climate_indicators(
            {"air_temperature_mean": {}},
            end_date=date(2026, 10, 31),
            methods={"precipitation_corrected": "sum"},
            window_days=(7,),
        )


def test_rejects_invalid_coverage_threshold():
    with pytest.raises(ValueError, match="minimum_coverage_ratio"):
        calculate_rolling_climate_indicators(
            {"air_temperature_mean": {}},
            end_date=date(2026, 10, 31),
            methods={"air_temperature_mean": "mean"},
            minimum_coverage_ratio=0.0,
        )
