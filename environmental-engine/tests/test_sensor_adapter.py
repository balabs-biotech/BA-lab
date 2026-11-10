from datetime import datetime, timezone
from uuid import uuid4

import pytest

from ba_environmental_engine.sources.sensor import normalize_iot_measurement_row


def joined_row(**overrides):
    organization_id = uuid4()
    environment_id = uuid4()
    row = {
        "id": uuid4(),
        "organization_id": organization_id,
        "device_organization_id": organization_id,
        "environment_organization_id": organization_id,
        "environment_id": environment_id,
        "device_environment_id": environment_id,
        "location_id": uuid4(),
        "iot_device_id": uuid4(),
        "variable_code": "temperature",
        "raw_value": 23.5,
        "raw_unit_code": "degC",
        "normalized_value": None,
        "normalized_unit_code": None,
        "canonical_unit_code": "degC",
        "measured_at": datetime(2026, 11, 10, 9, tzinfo=timezone.utc),
        "quality_state": "raw",
        "exclusion_reason": None,
        "method": "iot_sensor",
        "instrument": "ESP32",
        "metadata": {"source": "iot", "message_id": "msg-001"},
        "device_code": "BA-ESP32-01",
        "device_type": "esp32",
        "profile_origin": "sensor",
        "profile_status": "active",
        "profile_timezone": "Africa/Algiers",
        "profile_valid_from": "2026-01-01",
        "profile_valid_to": None,
        "profile_sensor_bound": True,
    }
    row.update(overrides)
    return row


def test_maps_existing_iot_measurement_to_sensor_contract():
    row = joined_row()
    result = normalize_iot_measurement_row(row)
    assert result.measurement.context_id == row["environment_id"]
    assert result.measurement.sensor_id == row["iot_device_id"]
    assert result.measurement.value == 23.5
    assert result.measurement.unit_code == "degC"
    assert result.quality_state == "raw"
    assert result.metadata["message_id"] == "msg-001"


def test_prefers_normalized_value_and_unit_as_a_pair():
    result = normalize_iot_measurement_row(
        joined_row(normalized_value=296.65, normalized_unit_code="K")
    )
    assert result.measurement.value == 296.65
    assert result.measurement.unit_code == "K"


def test_raw_value_requires_variable_canonical_unit():
    with pytest.raises(ValueError, match="canonical unit"):
        normalize_iot_measurement_row(joined_row(raw_unit_code="K"))


def test_rejects_tenant_and_environment_mismatches():
    with pytest.raises(ValueError, match="device tenant"):
        normalize_iot_measurement_row(joined_row(device_organization_id=uuid4()))
    with pytest.raises(ValueError, match="device environment"):
        normalize_iot_measurement_row(joined_row(device_environment_id=uuid4()))


def test_rejects_device_not_bound_to_active_sensor_profile():
    with pytest.raises(ValueError, match="not bound"):
        normalize_iot_measurement_row(joined_row(profile_sensor_bound=False))
    with pytest.raises(ValueError, match="active sensor-origin"):
        normalize_iot_measurement_row(joined_row(profile_status="draft"))


def test_rejects_measurement_outside_profile_calendar_validity():
    with pytest.raises(ValueError, match="before"):
        normalize_iot_measurement_row(joined_row(profile_valid_from="2026-12-01"))
    with pytest.raises(ValueError, match="after"):
        normalize_iot_measurement_row(joined_row(profile_valid_to="2026-11-09"))


def test_preserves_quality_and_requires_exclusion_reason():
    result = normalize_iot_measurement_row(joined_row(quality_state="validated"))
    assert result.quality_state == "validated"
    with pytest.raises(ValueError, match="exclusion_reason"):
        normalize_iot_measurement_row(
            joined_row(quality_state="excluded", exclusion_reason=None)
        )


def test_rejects_provider_row_or_naive_timestamp():
    with pytest.raises(ValueError, match="IoT source"):
        normalize_iot_measurement_row(joined_row(metadata={"source": "nasa_power"}))
    with pytest.raises(ValueError, match="timezone"):
        normalize_iot_measurement_row(
            joined_row(measured_at=datetime(2026, 11, 10, 9))
        )


def test_uses_measurement_id_as_source_lineage():
    row = joined_row()
    result = normalize_iot_measurement_row(row)
    assert result.measurement.source_observation_ids == [row["id"]]


def test_accepts_retired_profile_for_historical_measurements_inside_validity():
    result = normalize_iot_measurement_row(
        joined_row(profile_status="retired", profile_valid_to="2026-11-10")
    )
    assert result.measurement.value == 23.5
