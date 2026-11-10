from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from ba_environmental_engine.contexts.measurement import EnvironmentalMeasurement
from ba_environmental_engine.sources.sensor import SensorMeasurementEnvelope
from ba_environmental_engine.quality.sensor_health import assess_sensor_flatlines


ORG = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
LOC = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
ENV = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
SENSOR = UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd")


def row(index: int, value: float, quality: str = "validated"):
    observed = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=index)
    observation_id = UUID(f"eeeeeeee-eeee-4eee-8eee-{index:012d}")
    measurement = EnvironmentalMeasurement(
        observation_id=observation_id, organization_id=ORG, location_id=LOC,
        context_id=ENV, sensor_id=SENSOR, variable_code="air_temperature",
        value=value, unit_code="degC", observed_at=observed,
        source_observation_ids=[observation_id],
    )
    return SensorMeasurementEnvelope(
        measurement=measurement, quality_state=quality,
        exclusion_reason="excluded" if quality == "excluded" else None,
        method=None, instrument=None, device_code="sensor-01",
        device_type="environmental", metadata={"source": "iot"},
    )


def test_missing_policy_is_explicitly_not_evaluable():
    result = assess_sensor_flatlines([row(0, 20), row(1, 20)])
    assert result[0].status == "not_evaluable"
    assert result[0].longest_repeated_run == 0


def test_exact_repeated_run_requires_both_count_and_duration():
    result = assess_sensor_flatlines(
        [row(0, 20), row(1, 20), row(2, 20), row(3, 20), row(4, 20)],
        minimum_repeated_observations=5, minimum_duration_seconds=240,
    )
    assert result[0].status == "suspected"
    assert result[0].longest_repeated_run == 5
    assert result[0].longest_repeated_duration_seconds == 240


def test_stable_values_are_not_flagged_when_duration_policy_is_not_met():
    result = assess_sensor_flatlines(
        [row(0, 20), row(1, 20), row(2, 20)],
        minimum_repeated_observations=3, minimum_duration_seconds=240,
    )
    assert result[0].status == "normal"


def test_excluded_measurement_breaks_a_repeated_run():
    result = assess_sensor_flatlines(
        [row(0, 20), row(1, 20), row(2, 20, "excluded"),
         row(3, 20), row(4, 20)],
        minimum_repeated_observations=3, minimum_duration_seconds=60,
    )
    assert result[0].status == "normal"
    assert result[0].longest_repeated_run == 2


def test_partial_or_invalid_policy_is_rejected():
    with pytest.raises(ValueError, match="supplied together"):
        assess_sensor_flatlines([row(0, 20)], minimum_repeated_observations=3)
    with pytest.raises(ValueError, match="integer >= 2"):
        assess_sensor_flatlines(
            [row(0, 20)], minimum_repeated_observations=1,
            minimum_duration_seconds=60,
        )


def test_all_excluded_rows_are_insufficient_data_under_policy():
    result = assess_sensor_flatlines(
        [row(0, 20, "excluded")],
        minimum_repeated_observations=3, minimum_duration_seconds=60,
    )
    assert result[0].status == "insufficient_data"
