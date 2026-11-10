from datetime import date, timedelta

import pytest

from ba_environmental_engine.anomaly_detection.series import (
    DailySeriesObservation,
    assess_series_anomalies,
)


def daily_rows(start: date, values: list[float]):
    return [
        DailySeriesObservation(start + timedelta(days=index), value)
        for index, value in enumerate(values)
    ]


def test_detects_a_large_deviation_against_the_trailing_historical_baseline():
    rows = daily_rows(date(2026, 1, 1), [10.0, 10.2, 9.9, 10.1, 10.0, 10.2, 9.8, 10.1, 10.0, 10.2, 35.0])

    results = assess_series_anomalies(
        rows,
        baseline_window_days=10,
        minimum_reference_count=8,
        minimum_coverage_ratio=0.8,
        threshold=3.5,
    )

    assert results[-1].status == "suspect"
    assert results[-1].reference_count == 10
    assert results[-1].reference_median == pytest.approx(10.05)
    assert results[-1].robust_z_score is not None
    assert "historical_deviation" in results[-1].flags


def test_never_uses_future_observations_in_the_reference_window():
    rows = daily_rows(date(2026, 1, 1), [10.0, 10.2, 9.9, 10.1, 10.0, 10.2, 9.8, 10.1, 10.0, 10.2, 35.0])

    results = assess_series_anomalies(
        rows,
        baseline_window_days=10,
        minimum_reference_count=8,
        minimum_coverage_ratio=0.8,
    )

    assert results[-1].reference_count == 10
    assert results[-1].reference_median == pytest.approx(10.05)


def test_insufficient_coverage_is_not_misreported_as_normal():
    rows = [
        DailySeriesObservation(date(2026, 1, day), 10.0 + (day % 3) * 0.1)
        for day in (1, 2, 3, 4, 5, 10)
    ]

    results = assess_series_anomalies(
        rows,
        baseline_window_days=9,
        minimum_reference_count=3,
        minimum_coverage_ratio=0.7,
    )

    assert results[-1].status == "insufficient_coverage"
    assert results[-1].robust_z_score is None


def test_zero_mad_reference_is_indeterminate_not_a_false_positive():
    rows = daily_rows(date(2026, 1, 1), [10.0] * 10 + [30.0])

    results = assess_series_anomalies(
        rows,
        baseline_window_days=10,
        minimum_reference_count=8,
        minimum_coverage_ratio=0.8,
    )

    assert results[-1].status == "indeterminate"
    assert "zero_mad_reference" in results[-1].flags


def test_rejects_unsorted_duplicate_and_non_finite_observations():
    with pytest.raises(ValueError, match="sorted"):
        assess_series_anomalies([
            DailySeriesObservation(date(2026, 1, 2), 1.0),
            DailySeriesObservation(date(2026, 1, 1), 2.0),
        ])

    with pytest.raises(ValueError, match="finite"):
        assess_series_anomalies([
            DailySeriesObservation(date(2026, 1, 1), float("nan")),
        ])
