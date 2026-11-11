from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from ba_environmental_engine.quality.sensor_transmission import (
    SensorDeviceTransmission,
    SensorTransmissionReceipt,
    assess_sensor_transmissions,
)


BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)
DEVICE = UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd")


def device(*, enabled=True, bound=True, created_at=BASE - timedelta(days=1)):
    return SensorDeviceTransmission(
        device_id=DEVICE, device_code="sensor-01", enabled=enabled,
        created_at=created_at, profile_bound=bound,
        expected_from=BASE - timedelta(days=1),
    )


def receipt(index: int, minute: int):
    return SensorTransmissionReceipt(
        receipt_id=UUID(f"eeeeeeee-eeee-4eee-8eee-{index:012d}"),
        device_id=DEVICE,
        received_at=BASE + timedelta(minutes=minute),
    )


def assess(receipts):
    return assess_sensor_transmissions(
        [device()], receipts,
        evaluation_start=BASE,
        evaluation_end=BASE + timedelta(minutes=10),
        evaluated_at=BASE + timedelta(minutes=10),
        expected_interval_seconds=60,
        gap_tolerance_factor=2.0,
        current_window=True,
    )[0]


def test_regular_receipts_are_normal_and_keep_receipt_lineage():
    rows = [receipt(1, 7), receipt(2, 8), receipt(3, 9), receipt(4, 10)]
    result = assess(rows)
    assert result.status == "normal"
    assert result.receipt_count == 4
    assert result.gap_count == 0
    assert result.maximum_gap_seconds == 60
    assert result.source_receipt_ids == tuple(row.receipt_id for row in rows)


def test_large_interior_gap_is_irregular():
    result = assess([receipt(1, 0), receipt(2, 1), receipt(3, 5), receipt(4, 6), receipt(5, 7), receipt(6, 8), receipt(7, 9), receipt(8, 10)])
    assert result.status == "irregular"
    assert result.gap_count == 1
    assert result.maximum_gap_seconds == 240


def test_current_trailing_silence_is_reported_separately():
    result = assess([receipt(1, 0), receipt(2, 1)])
    assert result.status == "silent"
    assert result.trailing_silence_seconds == 540
    assert result.gap_count == 0


def test_historical_window_does_not_label_device_currently_silent():
    result = assess_sensor_transmissions(
        [device()], [receipt(1, 0), receipt(2, 1)],
        evaluation_start=BASE,
        evaluation_end=BASE + timedelta(minutes=10),
        evaluated_at=BASE + timedelta(days=2),
        expected_interval_seconds=60,
        gap_tolerance_factor=2.0,
        current_window=False,
    )[0]
    assert result.status == "normal"
    assert result.trailing_silence_seconds is None


def test_no_receipt_history_is_insufficient_before_one_tolerance_window_elapses():
    short_window_device = SensorDeviceTransmission(
        device_id=DEVICE, device_code="sensor-01", enabled=True,
        created_at=BASE - timedelta(days=1), profile_bound=True,
        expected_from=BASE,
    )
    result = assess_sensor_transmissions(
        [short_window_device], [],
        evaluation_start=BASE,
        evaluation_end=BASE + timedelta(seconds=30),
        evaluated_at=BASE + timedelta(seconds=30),
        expected_interval_seconds=60,
        gap_tolerance_factor=2.0,
        current_window=True,
    )[0]
    assert result.status == "insufficient_data"
    assert result.trailing_silence_seconds == 30
    assert result.last_received_at is None


def test_zero_receipts_become_silent_after_explicit_expectation_window_elapses():
    result = assess([])
    assert result.status == "silent"
    assert result.trailing_silence_seconds == 87000
    assert result.last_received_at is None


@pytest.mark.parametrize("enabled,bound", [(False, True), (True, False)])
def test_disabled_or_unbound_devices_are_not_evaluable(enabled, bound):
    result = assess_sensor_transmissions(
        [device(enabled=enabled, bound=bound)], [],
        evaluation_start=BASE,
        evaluation_end=BASE + timedelta(minutes=10),
        evaluated_at=BASE + timedelta(minutes=10),
        expected_interval_seconds=60,
        gap_tolerance_factor=2.0,
        current_window=True,
    )[0]
    assert result.status == "not_evaluable"


def test_receipts_outside_device_expectation_window_are_ignored():
    expired = SensorDeviceTransmission(
        device_id=DEVICE, device_code="sensor-01", enabled=True,
        created_at=BASE - timedelta(days=1), profile_bound=True,
        expected_from=BASE - timedelta(days=1),
        expected_to=BASE + timedelta(minutes=2),
    )
    result = assess_sensor_transmissions(
        [expired], [receipt(1, 0), receipt(2, 1), receipt(3, 8)],
        evaluation_start=BASE,
        evaluation_end=BASE + timedelta(minutes=10),
        evaluated_at=BASE + timedelta(minutes=10),
        expected_interval_seconds=60,
        gap_tolerance_factor=2.0,
        current_window=True,
    )[0]
    assert result.status == "normal"
    assert result.receipt_count == 2


def test_policy_is_mandatory_and_validated():
    with pytest.raises(ValueError, match="positive integer"):
        assess_sensor_transmissions(
            [device()], [], evaluation_start=BASE,
            evaluation_end=BASE + timedelta(minutes=1),
            evaluated_at=BASE + timedelta(minutes=1),
            expected_interval_seconds=0, gap_tolerance_factor=2.0,
        )
    with pytest.raises(ValueError, match="greater than 1"):
        assess_sensor_transmissions(
            [device()], [], evaluation_start=BASE,
            evaluation_end=BASE + timedelta(minutes=1),
            evaluated_at=BASE + timedelta(minutes=1),
            expected_interval_seconds=60, gap_tolerance_factor=1.0,
        )


def test_duplicate_receipt_ids_are_rejected():
    duplicate = receipt(1, 0)
    with pytest.raises(ValueError, match="receipt IDs must be unique"):
        assess_sensor_transmissions(
            [device()], [duplicate, duplicate],
            evaluation_start=BASE,
            evaluation_end=BASE + timedelta(minutes=1),
            evaluated_at=BASE + timedelta(minutes=1),
            expected_interval_seconds=60,
            gap_tolerance_factor=2.0,
        )


def test_registry_last_seen_can_confirm_current_silence_without_in_scope_receipts():
    stale_device = SensorDeviceTransmission(
        device_id=DEVICE, device_code="sensor-01", enabled=True,
        created_at=BASE - timedelta(days=1), profile_bound=True,
        expected_from=BASE - timedelta(days=1),
        last_seen_at=BASE - timedelta(minutes=10),
    )
    result = assess_sensor_transmissions(
        [stale_device], [],
        evaluation_start=BASE,
        evaluation_end=BASE + timedelta(minutes=10),
        evaluated_at=BASE + timedelta(minutes=10),
        expected_interval_seconds=60,
        gap_tolerance_factor=2.0,
        current_window=True,
    )[0]
    assert result.status == "silent"
    assert result.receipt_count == 0
    assert result.trailing_silence_seconds == 1200
    assert result.source_receipt_ids == ()


def test_registry_last_seen_is_not_used_for_historical_silence():
    stale_device = SensorDeviceTransmission(
        device_id=DEVICE, device_code="sensor-01", enabled=True,
        created_at=BASE - timedelta(days=1), profile_bound=True,
        expected_from=BASE - timedelta(days=1),
        last_seen_at=BASE - timedelta(minutes=10),
    )
    result = assess_sensor_transmissions(
        [stale_device], [],
        evaluation_start=BASE,
        evaluation_end=BASE + timedelta(minutes=10),
        evaluated_at=BASE + timedelta(days=2),
        expected_interval_seconds=60,
        gap_tolerance_factor=2.0,
        current_window=False,
    )[0]
    assert result.status == "insufficient_data"
    assert result.trailing_silence_seconds is None
    assert result.last_received_at is None
