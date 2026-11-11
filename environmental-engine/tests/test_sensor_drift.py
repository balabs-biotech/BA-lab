from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from ba_environmental_engine.contexts.measurement import EnvironmentalMeasurement, MeasurementOrigin
from ba_environmental_engine.quality.sensor_drift import (
    SensorDriftPolicy,
    assess_sensor_drift,
)
from ba_environmental_engine.sources.sensor import SensorMeasurementEnvelope


BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)
ORG = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
LOCATION = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
CONTEXT = UUID("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
TARGET = UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd")
REFERENCE = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")


def envelope(sensor_id, index, value, *, minute=None, unit="degC", quality="validated"):
    observed_at = BASE + timedelta(minutes=index * 60 if minute is None else minute)
    observation_number = index * 2 + (1 if sensor_id == TARGET else 2)
    observation_id = UUID(f"f0000000-0000-4000-8000-{observation_number:012d}")
    measurement = EnvironmentalMeasurement(
        observation_id=observation_id,
        organization_id=ORG,
        location_id=LOCATION,
        context_id=CONTEXT,
        origin=MeasurementOrigin.SENSOR,
        sensor_id=sensor_id,
        variable_code="air_temperature",
        value=value,
        unit_code=unit,
        observed_at=observed_at,
        source_observation_ids=[observation_id],
    )
    return SensorMeasurementEnvelope(
        measurement=measurement,
        quality_state=quality,
        exclusion_reason="test exclusion" if quality == "excluded" else None,
        method=None,
        instrument=None,
        device_code=str(sensor_id),
        device_type="environmental",
        metadata={"source": "iot"},
    )


def policy(**overrides):
    values = dict(
        target_sensor_id=TARGET,
        reference_sensor_id=REFERENCE,
        variable_code="air_temperature",
        reference_binding_verified=True,
        maximum_pair_offset_seconds=30,
        minimum_pairs=3,
        minimum_duration_seconds=7200,
        maximum_abs_drift_rate_per_hour=0.2,
    )
    values.update(overrides)
    return SensorDriftPolicy(**values)


def paired_rows(differentials):
    rows = []
    for index, difference in enumerate(differentials):
        rows.append(envelope(REFERENCE, index, 20.0))
        rows.append(envelope(TARGET, index, 20.0 + difference))
    return rows


def test_progressive_reference_divergence_is_suspected_with_lineage():
    rows = paired_rows([0.0, 0.5, 1.0, 1.5])
    result = assess_sensor_drift(rows, [policy()])[0]

    assert result.status == "suspected"
    assert result.pair_count == 4
    assert result.robust_drift_rate_per_hour == pytest.approx(0.5)
    assert len(result.source_target_observation_ids) == 4
    assert len(result.source_reference_observation_ids) == 4


def test_stable_reference_difference_is_normal():
    result = assess_sensor_drift(paired_rows([0.5, 0.5, 0.5, 0.5]), [policy()])[0]

    assert result.status == "normal"
    assert result.robust_drift_rate_per_hour == pytest.approx(0.0)


def test_single_sensor_trend_is_not_evaluable_without_reference_measurements():
    rows = [envelope(TARGET, index, 20.0 + index) for index in range(4)]
    result = assess_sensor_drift(rows, [policy()])[0]

    assert result.status == "not_evaluable"
    assert result.reason == "reference_pair_measurements_missing"


def test_excluded_measurements_do_not_participate_in_reference_pairs():
    rows = paired_rows([0.0, 0.5, 1.0, 1.5])
    rows.append(envelope(TARGET, 10, 99.0, quality="excluded"))
    result = assess_sensor_drift(rows, [policy()])[0]

    assert result.status == "suspected"
    assert result.pair_count == 4


def test_reference_pairing_uses_each_reference_observation_at_most_once():
    rows = [
        envelope(REFERENCE, 0, 20.0, minute=0),
        envelope(TARGET, 0, 20.0, minute=0),
        envelope(TARGET, 1, 21.0, minute=1),
        envelope(TARGET, 2, 22.0, minute=2),
    ]
    result = assess_sensor_drift(rows, [policy(
        maximum_pair_offset_seconds=180,
        minimum_pairs=3,
        minimum_duration_seconds=60,
    )])[0]

    assert result.pair_count == 1


def test_incompatible_canonical_units_are_not_evaluable():
    rows = paired_rows([0.0, 0.5, 1.0, 1.5])
    rows = [
        envelope(REFERENCE, index, 20.0, unit="degF")
        if row.measurement.sensor_id == REFERENCE else row
        for index, row in enumerate(rows)
    ]
    result = assess_sensor_drift(rows, [policy()])[0]

    assert result.status == "not_evaluable"
    assert result.reason == "canonical_units_incompatible"


def test_insufficient_pairs_or_duration_is_not_reported_as_normal():
    result = assess_sensor_drift(paired_rows([0.0, 0.5]), [policy()])[0]

    assert result.status == "insufficient_data"
    assert result.robust_drift_rate_per_hour is None


def test_drift_policy_requires_explicit_positive_limits():
    with pytest.raises(ValueError, match="maximum_pair_offset_seconds"):
        assess_sensor_drift(
            paired_rows([0.0, 0.5, 1.0]),
            [policy(maximum_pair_offset_seconds=0)],
        )
    with pytest.raises(ValueError, match="maximum_abs_drift_rate_per_hour"):
        assess_sensor_drift(
            paired_rows([0.0, 0.5, 1.0]),
            [policy(maximum_abs_drift_rate_per_hour=0)],
        )


def test_slope_sampling_is_bounded_and_deterministic():
    differentials = [index * 0.1 for index in range(250)]
    result = assess_sensor_drift(
        paired_rows(differentials),
        [policy(minimum_pairs=200, minimum_duration_seconds=100 * 3600)],
    )[0]

    assert result.pair_count == 250
    assert result.slope_sample_count == 200
    assert result.robust_drift_rate_per_hour == pytest.approx(0.1)


def test_unverified_reference_binding_is_not_evaluable():
    result = assess_sensor_drift(
        paired_rows([0.0, 0.5, 1.0, 1.5]),
        [policy(reference_binding_verified=False)],
    )[0]

    assert result.status == "not_evaluable"
    assert result.reason == "reference_pair_not_verified"


def test_reference_pair_context_must_match():
    rows = paired_rows([0.0, 0.5, 1.0, 1.5])
    moved_reference = [
        envelope(REFERENCE, index, 20.0)
        for index in range(4)
    ]
    moved_reference = [
        SensorMeasurementEnvelope(
            measurement=row.measurement.model_copy(update={"context_id": UUID("99999999-9999-4999-8999-999999999999")}),
            quality_state=row.quality_state,
            exclusion_reason=row.exclusion_reason,
            method=row.method,
            instrument=row.instrument,
            device_code=row.device_code,
            device_type=row.device_type,
            metadata=row.metadata,
        )
        for row in moved_reference
    ]
    rows = [row for row in rows if row.measurement.sensor_id == TARGET] + moved_reference
    result = assess_sensor_drift(rows, [policy()])[0]

    assert result.status == "not_evaluable"
    assert result.reason == "reference_pair_context_mismatch"


def test_reference_tie_breaking_prefers_earlier_timestamp():
    target = envelope(TARGET, 10, 20.0, minute=10)
    earlier = envelope(REFERENCE, 20, 19.0, minute=9)
    later = envelope(REFERENCE, 21, 19.0, minute=11)
    result = assess_sensor_drift(
        [target, later, earlier],
        [policy(maximum_pair_offset_seconds=60, minimum_pairs=3, minimum_duration_seconds=1)],
    )[0]

    assert result.source_reference_observation_ids == (earlier.measurement.observation_id,)
