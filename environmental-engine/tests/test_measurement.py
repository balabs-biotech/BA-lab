from datetime import datetime, timezone
from uuid import uuid4

import pytest

from ba_environmental_engine.contexts.measurement import (
    CalibrationStatus,
    EnvironmentalMeasurement,
    MeasurementOrigin,
    SensorDescriptor,
)


def sensor(**overrides):
    data = {
        "sensor_id": uuid4(),
        "organization_id": uuid4(),
        "location_id": uuid4(),
        "context_id": uuid4(),
        "label": "SHT31 chambre fructification",
        "manufacturer": "Sensirion",
        "model": "SHT31",
        "measures": ["air_temperature", "relative_humidity"],
        "installed_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "calibration_status": CalibrationStatus.NOT_CALIBRATED,
    }
    data.update(overrides)
    return data


def test_sensor_declares_identity_capabilities_and_installation():
    result = SensorDescriptor.model_validate(sensor())
    assert result.model == "SHT31"
    assert set(result.measures) == {"air_temperature", "relative_humidity"}


def test_sensor_installation_window_must_be_valid():
    data = sensor(removed_at=datetime(2025, 12, 31, tzinfo=timezone.utc))
    with pytest.raises(ValueError, match="after installed_at"):
        SensorDescriptor.model_validate(data)


def test_calibrated_sensor_requires_calibration_timestamp():
    data = sensor(calibration_status=CalibrationStatus.CALIBRATED)
    with pytest.raises(ValueError, match="calibrated_at"):
        SensorDescriptor.model_validate(data)


def measurement(**overrides):
    data = {
        "observation_id": uuid4(),
        "organization_id": uuid4(),
        "location_id": uuid4(),
        "context_id": uuid4(),
        "sensor_id": uuid4(),
        "variable_code": "air_temperature_mean",
        "value": 24.5,
        "unit_code": "degC",
        "observed_at": datetime(2026, 6, 1, 10, tzinfo=timezone.utc),
    }
    data.update(overrides)
    return data


def test_measurement_preserves_sensor_context_and_source_lineage():
    source_id = uuid4()
    result = EnvironmentalMeasurement.model_validate(
        measurement(source_observation_ids=[source_id])
    )
    assert result.source_observation_ids == [source_id]
    assert result.sensor_id is not None


def test_measurement_rejects_naive_timestamp_and_nonfinite_values():
    with pytest.raises(ValueError, match="timezone"):
        EnvironmentalMeasurement.model_validate(
            measurement(observed_at=datetime(2026, 6, 1, 10))
        )
    with pytest.raises(ValueError, match="finite"):
        EnvironmentalMeasurement.model_validate(measurement(value=float("nan")))


def test_measurement_rejects_duplicate_source_ids():
    source_id = uuid4()
    with pytest.raises(ValueError, match="unique"):
        EnvironmentalMeasurement.model_validate(
            measurement(source_observation_ids=[source_id, source_id])
        )


def test_derived_measurement_requires_explicit_source_and_formula_version():
    data = measurement(
        origin=MeasurementOrigin.DERIVED,
        sensor_id=None,
        variable_code="vpd_air",
        unit_code="kPa",
    )
    with pytest.raises(ValueError, match="derived measurements require"):
        EnvironmentalMeasurement.model_validate(data)

    data.update(
        source_observation_ids=[uuid4(), uuid4()],
        formula_code="tetens_fao56",
        formula_version="1.0.0",
    )
    result = EnvironmentalMeasurement.model_validate(data)
    assert result.origin is MeasurementOrigin.DERIVED


def test_non_sensor_measurement_cannot_claim_sensor_id():
    with pytest.raises(ValueError, match="non-sensor"):
        EnvironmentalMeasurement.model_validate(
            measurement(origin=MeasurementOrigin.MANUAL)
        )


def test_sensor_value_must_not_accept_boolean():
    with pytest.raises(ValueError, match="finite"):
        EnvironmentalMeasurement.model_validate(measurement(value=True))
