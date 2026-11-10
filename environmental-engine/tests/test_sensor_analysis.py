from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from ba_environmental_engine.contexts.measurement import EnvironmentalMeasurement
from ba_environmental_engine.sources.sensor import SensorMeasurementEnvelope
from ba_environmental_engine.sources.sensor_analysis import summarize_sensor_measurements


ORG = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
LOC = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
ENV = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
SENSOR = UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd")


def envelope(index: int, value: float, *, quality: str = "validated", unit: str = "degC"):
    observed = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=index)
    observation_id = UUID(f"eeeeeeee-eeee-4eee-8eee-{index:012d}")
    measurement = EnvironmentalMeasurement(
        observation_id=observation_id,
        organization_id=ORG,
        location_id=LOC,
        context_id=ENV,
        sensor_id=SENSOR,
        variable_code="air_temperature",
        value=value,
        unit_code=unit,
        observed_at=observed,
        source_observation_ids=[observation_id],
    )
    return SensorMeasurementEnvelope(
        measurement=measurement,
        quality_state=quality,
        exclusion_reason="manual exclusion" if quality == "excluded" else None,
        method=None,
        instrument=None,
        device_code="sensor-01",
        device_type="environmental",
        metadata={"source": "iot"},
    )


def test_sensor_summary_keeps_excluded_rows_out_of_statistics_but_in_lineage():
    result = summarize_sensor_measurements(
        [envelope(0, 20), envelope(1, 999, quality="excluded"), envelope(2, 24)],
        from_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        to_at_exclusive=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
        expected_interval_seconds=60,
    )
    series = result.series[0]
    assert series.status == "ok"
    assert series.observation_count == 3
    assert series.usable_count == 2
    assert series.excluded_count == 1
    assert series.mean == 22
    assert series.minimum == 20
    assert series.maximum == 24
    assert series.expected_count == 60
    assert series.availability_ratio == pytest.approx(2 / 60)
    assert result.excluded_observations == 1
    assert len(series.source_observation_ids) == 3


def test_sensor_summary_reports_insufficient_data_when_all_rows_excluded():
    result = summarize_sensor_measurements(
        [envelope(0, 20, quality="excluded")],
        from_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        to_at_exclusive=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
    )
    assert result.series[0].status == "insufficient_data"
    assert result.series[0].mean is None
    assert result.series[0].excluded_count == 1


def test_sensor_summary_rejects_duplicate_sensor_variable_timestamp():
    row = envelope(0, 20)
    with pytest.raises(ValueError, match="duplicate"):
        summarize_sensor_measurements(
            [row, row],
            from_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            to_at_exclusive=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
        )


def test_sensor_summary_rejects_mixed_units_for_same_stream():
    with pytest.raises(ValueError, match="incompatible"):
        summarize_sensor_measurements(
            [envelope(0, 20, unit="degC"), envelope(1, 68, unit="degF")],
            from_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            to_at_exclusive=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
        )


def test_sensor_summary_uses_half_open_window_and_requires_aware_bounds():
    result = summarize_sensor_measurements(
        [envelope(0, 20), envelope(60, 25)],
        from_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        to_at_exclusive=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
    )
    assert result.total_observations == 1
    with pytest.raises(ValueError, match="timezone"):
        summarize_sensor_measurements(
            [],
            from_at=datetime(2026, 1, 1),
            to_at_exclusive=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
        )
