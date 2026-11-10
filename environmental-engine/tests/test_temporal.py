from datetime import date, timedelta

import pytest

from ba_environmental_engine.quality.temporal import (
    DailyObservation,
    assess_temporal_anomalies,
)


def series(values):
    start = date(2026, 1, 1)
    return [
        DailyObservation(observed_date=start + timedelta(days=i), value=value)
        for i, value in enumerate(values)
    ]


def test_detects_spike_using_only_preceding_observations():
    observations = series([20.0, 20.2, 19.9, 20.1, 20.0, 20.2, 19.8, 45.0])

    result = assess_temporal_anomalies(
        observations, window=7, minimum_history=7, threshold=3.5
    )

    assert result[-1].status == "suspect"
    assert "robust_deviation" in result[-1].flags
    assert result[-1].baseline_median == pytest.approx(20.0)
    assert result[-1].evaluated_value == 45.0


def test_does_not_flag_values_inside_stable_series():
    observations = series([20.0, 20.2, 19.9, 20.1, 20.0, 20.2, 19.8, 20.1])

    result = assess_temporal_anomalies(
        observations, window=7, minimum_history=7, threshold=3.5
    )

    assert result[-1].status == "normal"
    assert result[-1].flags == ()


def test_marks_short_history_as_insufficient_instead_of_guessing():
    result = assess_temporal_anomalies(series([10.0, 11.0, 12.0]), window=7, minimum_history=5)

    assert all(item.status == "insufficient_history" for item in result)


def test_zero_mad_is_indeterminate_and_does_not_create_false_positive():
    result = assess_temporal_anomalies(
        series([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 25.0]),
        window=7,
        minimum_history=7,
    )

    assert result[-1].status == "indeterminate"
    assert "zero_mad_baseline" in result[-1].flags


def test_rejects_duplicate_dates_and_non_finite_values():
    observations = series([1.0, 2.0])
    observations[1] = DailyObservation(observed_date=observations[0].observed_date, value=2.0)
    with pytest.raises(ValueError, match="duplicate"):
        assess_temporal_anomalies(observations)

    with pytest.raises(ValueError, match="finite"):
        assess_temporal_anomalies(series([1.0, float("nan")]))


def test_rejects_invalid_window_parameters():
    with pytest.raises(ValueError):
        assess_temporal_anomalies(series([1.0, 2.0]), window=0)
