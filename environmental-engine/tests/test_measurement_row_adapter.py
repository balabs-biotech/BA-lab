from datetime import datetime, timezone

import pytest

from ba_environmental_engine.indicators.measurement_adapter import (
    measurement_row_to_biological_measurement,
)


def source_row(**overrides):
    row = {
        "id": "measurement-1",
        "organization_id": "org-1",
        "culture_id": "culture-1",
        "plant_culture_id": None,
        "sample_id": None,
        "experimental_unit_id": None,
        "variable_code": "root_length",
        "raw_value": 12,
        "raw_unit_code": "mm",
        "normalized_value": 12,
        "normalized_unit_code": "mm",
        "measured_at": "2026-11-10T10:00:00+01:00",
        "quality_state": "validated",
        "method": "digital_caliper",
        "instrument": "caliper-01",
        "event_id": "event-1",
        "result_id": "result-1",
    }
    row.update(overrides)
    return row


def test_adapter_prefers_normalized_value_only_when_its_unit_is_canonical():
    result = measurement_row_to_biological_measurement(
        source_row(raw_value=11, normalized_value=12),
        variable_registry={"root_length": "mm"},
    )
    assert result.value == 12
    assert result.value_source == "normalized"
    assert result.canonical_unit_code == "mm"
    assert result.subject_type == "culture"
    assert result.subject_id == "culture-1"
    assert result.event_id == "event-1"
    assert result.result_id == "result-1"
    assert result.method == "digital_caliper"
    assert result.instrument == "caliper-01"


def test_adapter_falls_back_to_raw_value_when_normalized_value_is_unavailable():
    result = measurement_row_to_biological_measurement(
        source_row(normalized_value=None, normalized_unit_code=None),
        variable_registry={"root_length": "mm"},
    )
    assert result.value == 12
    assert result.value_source == "raw"
    assert result.source_unit_code == "mm"


def test_adapter_uses_raw_value_if_normalized_unit_is_not_canonical():
    result = measurement_row_to_biological_measurement(
        source_row(normalized_value=1.2, normalized_unit_code="cm"),
        variable_registry={"root_length": "mm"},
    )
    assert result.value == 12
    assert result.value_source == "raw"


def test_adapter_rejects_measurement_without_exactly_one_subject_link():
    with pytest.raises(ValueError, match="exactly one"):
        measurement_row_to_biological_measurement(
            source_row(culture_id=None),
            variable_registry={"root_length": "mm"},
        )


def test_adapter_rejects_ambiguous_multiple_subject_links():
    with pytest.raises(ValueError, match="exactly one"):
        measurement_row_to_biological_measurement(
            source_row(sample_id="sample-1"),
            variable_registry={"root_length": "mm"},
        )


def test_adapter_rejects_values_that_cannot_be_proven_to_use_canonical_unit():
    with pytest.raises(ValueError, match="canonical unit"):
        measurement_row_to_biological_measurement(
            source_row(raw_unit_code="cm", normalized_value=1.2, normalized_unit_code="cm"),
            variable_registry={"root_length": "mm"},
        )


def test_adapter_rejects_unknown_variables_and_naive_timestamps():
    with pytest.raises(ValueError, match="variable registry"):
        measurement_row_to_biological_measurement(
            source_row(), variable_registry={}
        )
    with pytest.raises(ValueError, match="timezone"):
        measurement_row_to_biological_measurement(
            source_row(measured_at="2026-11-10T10:00:00"),
            variable_registry={"root_length": "mm"},
        )


def test_adapter_preserves_plant_culture_subject_type():
    result = measurement_row_to_biological_measurement(
        source_row(culture_id=None, plant_culture_id="plant-culture-1"),
        variable_registry={"root_length": "mm"},
    )
    assert result.subject_type == "plant_culture"
    assert result.subject_id == "plant-culture-1"
