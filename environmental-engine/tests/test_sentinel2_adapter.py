from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from ba_environmental_engine import sources


def observation_row(**overrides):
    row = {
        "id": str(uuid4()),
        "organization_id": str(uuid4()),
        "location_id": str(uuid4()),
        "data_family": "satellite",
        "provider_code": "EARTH_SEARCH",
        "dataset_code": "SENTINEL_2_L2A",
        "variable_code": "ndvi_mean",
        "value": 0.62,
        "unit_code": "1",
        "observed_at": "2026-11-10T10:24:33Z",
        "retrieved_at": "2026-11-10T12:00:00Z",
        "spatial_resolution_m": 10.0,
        "quality_flag": "valid",
        "source_url": "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/scene-001",
        "metadata": {
            "scene_id": "scene-001",
            "cloud_cover_pct": 12.4,
            "valid_pixel_count": 812,
            "valid_pixel_ratio": 0.84,
            "processing_version": "ndvi-v1",
            "mask_classes": [0, 1, 3, 8, 9, 10, 11],
        },
    }
    row.update(overrides)
    return row


def normalizer():
    candidate = getattr(sources, "normalize_sentinel2_observation", None)
    assert callable(candidate), (
        "sources must expose a Sentinel-2 adapter for persisted NDVI observations"
    )
    return candidate


def test_sentinel2_adapter_normalizes_persisted_ndvi_and_preserves_provenance():
    row = observation_row()

    result = normalizer()(row)

    assert result.source_observation_id == UUID(row["id"])
    assert result.organization_id == UUID(row["organization_id"])
    assert result.location_id == UUID(row["location_id"])
    assert result.data_family == "satellite"
    assert result.provider_code == "EARTH_SEARCH"
    assert result.dataset_code == "SENTINEL_2_L2A"
    assert result.variable_code == "ndvi_mean"
    assert result.source_parameter == "ndvi_mean"
    assert result.value == pytest.approx(0.62)
    assert result.unit == "1"
    assert result.source_value == pytest.approx(0.62)
    assert result.source_unit == "1"
    assert result.observed_at == datetime(2026, 11, 10, 10, 24, 33, tzinfo=timezone.utc)
    assert result.observed_date.isoformat() == "2026-11-10"
    assert result.retrieved_at == datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)
    assert result.spatial_resolution_m == pytest.approx(10.0)
    assert result.quality_flag == "valid"
    assert result.source_url == row["source_url"]
    assert result.source_time_standard == "UTC"
    assert result.source_metadata == row["metadata"]


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("data_family", "weather", "satellite"),
        ("value", 1.2, "NDVI"),
        ("value", -1.1, "NDVI"),
        ("unit_code", "%", "dimensionless"),
        ("spatial_resolution_m", 0, "spatial_resolution_m"),
        ("observed_at", "2026-11-10T10:24:33", "timezone"),
        ("retrieved_at", "2026-11-10T12:00:00", "timezone"),
    ],
)
def test_sentinel2_adapter_rejects_invalid_observation_contract(field, value, message):
    row = observation_row(**{field: value})

    with pytest.raises(ValueError, match=message):
        normalizer()(row)


def test_sentinel2_adapter_rejects_invalid_pixel_quality_metadata():
    row = observation_row(metadata={
        "scene_id": "scene-001",
        "cloud_cover_pct": 12.4,
        "valid_pixel_count": 812,
        "valid_pixel_ratio": 1.4,
        "processing_version": "ndvi-v1",
        "mask_classes": [0, 1, 3, 8, 9, 10, 11],
    })

    with pytest.raises(ValueError, match="valid_pixel_ratio"):
        normalizer()(row)
