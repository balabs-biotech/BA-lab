from datetime import datetime, timedelta, timezone

import pytest

from ba_environmental_engine.indicators.vpd_aggregation import (
    VPDObservation,
    aggregate_vpd_period,
)


def observations(values, start=None, step_minutes=60):
    start = start or datetime(2026, 6, 1, tzinfo=timezone.utc)
    return [
        VPDObservation(start + timedelta(minutes=i * step_minutes), value)
        for i, value in enumerate(values)
    ]


def test_aggregates_vpd_and_counts_time_above_threshold():
    rows = observations([0.5, 1.5, 2.5])
    result = aggregate_vpd_period(rows, threshold_kpa=1.0)

    assert result.mean_vpd_kpa == pytest.approx(1.5)
    assert result.minimum_vpd_kpa == pytest.approx(0.5)
    assert result.maximum_vpd_kpa == pytest.approx(2.5)
    assert result.observation_count == 3
    assert result.duration_above_threshold_hours == pytest.approx(1.5)


def test_does_not_estimate_duration_across_large_sampling_gaps():
    rows = observations([2.0, 2.0, 2.0], step_minutes=60)
    rows[2] = VPDObservation(rows[2].observed_at + timedelta(hours=10), 2.0)
    result = aggregate_vpd_period(rows, threshold_kpa=1.0, maximum_gap_hours=2.0)
    assert result.duration_above_threshold_hours == pytest.approx(1.0)
    assert result.excluded_gap_count == 1


def test_interpolates_threshold_crossing_linearly():
    rows = observations([0.0, 2.0])
    result = aggregate_vpd_period(rows, threshold_kpa=1.0)
    assert result.duration_above_threshold_hours == pytest.approx(0.5)


def test_rejects_naive_timestamps_duplicate_times_and_invalid_values():
    naive = [VPDObservation(datetime(2026, 6, 1), 1.0)]
    with pytest.raises(ValueError, match="timezone"):
        aggregate_vpd_period(naive)

    duplicate = observations([1.0, 2.0])
    duplicate[1] = VPDObservation(duplicate[0].observed_at, 2.0)
    with pytest.raises(ValueError, match="strictly increasing"):
        aggregate_vpd_period(duplicate)

    invalid = [VPDObservation(datetime(2026, 6, 1, tzinfo=timezone.utc), float("nan"))]
    with pytest.raises(ValueError, match="finite"):
        aggregate_vpd_period(invalid)


def test_rejects_invalid_threshold_and_gap():
    rows = observations([1.0, 2.0])
    with pytest.raises(ValueError):
        aggregate_vpd_period(rows, threshold_kpa=-1.0)
    with pytest.raises(ValueError):
        aggregate_vpd_period(rows, maximum_gap_hours=0.0)
