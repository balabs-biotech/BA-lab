from datetime import datetime, timezone
from uuid import uuid4

import pytest

from ba_environmental_engine.sources.sentinel2_raster import calculate_ndvi_statistics
from ba_environmental_engine.sources.sentinel2_ingestion import (
    build_sentinel2_observation_rows,
)


def _inputs():
    stats = calculate_ndvi_statistics(
        [[1000, 1000], [1000, 1000]],
        [[3000, 3000], [3000, 3000]],
        scl=[[4, 4], [4, 4]],
    )
    return {
        "statistics": stats,
        "organization_id": uuid4(),
        "location_id": uuid4(),
        "scene_id": "S2A_TEST_SCENE",
        "observed_at": datetime(2026, 10, 1, 10, tzinfo=timezone.utc),
        "retrieved_at": datetime(2026, 10, 2, 10, tzinfo=timezone.utc),
        "source_url": "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_TEST_SCENE",
        "cloud_cover_pct": 12.5,
        "spatial_resolution_m": 10,
        "processing_version": "ba-s2-native-v1",
    }


def test_builds_two_persistable_ndvi_rows_with_complete_provenance():
    rows = build_sentinel2_observation_rows(**_inputs())

    assert [row["variable_code"] for row in rows] == ["ndvi_mean", "ndvi_median"]
    assert [row["value"] for row in rows] == [0.5, 0.5]
    for row in rows:
        assert row["data_family"] == "satellite"
        assert row["provider_code"] == "EARTH_SEARCH"
        assert row["dataset_code"] == "SENTINEL_2_L2A"
        assert row["unit_code"] == "1"
        assert row["source_record_id"] == "S2A_TEST_SCENE"\n        assert row["metadata"]["scene_id"] == "S2A_TEST_SCENE"
        assert row["metadata"]["valid_pixel_count"] == 4
        assert row["metadata"]["valid_pixel_ratio"] == 1
        assert row["metadata"]["mask_classes"] == []
        assert row["quality_flag"] == "valid"


def test_rejects_low_quality_result_instead_of_persisting_it_as_valid():
    inputs = _inputs()
    inputs["statistics"] = calculate_ndvi_statistics(
        [[1000, 1000], [1000, 1000]],
        [[3000, 3000], [3000, 3000]],
        scl=[[4, 3], [8, 9]],
        minimum_valid_ratio=0.5,
    )

    rows = build_sentinel2_observation_rows(**inputs)

    assert all(row["quality_flag"] == "insufficient_valid_pixels" for row in rows)
    assert all(row["metadata"]["valid_pixel_ratio"] == 0.25 for row in rows)


def test_rejects_naive_timestamps_and_invalid_source_url():
    inputs = _inputs()
    inputs["observed_at"] = datetime(2026, 10, 1, 10)
    with pytest.raises(ValueError, match="timezone-aware"):
        build_sentinel2_observation_rows(**inputs)

    inputs = _inputs()
    inputs["source_url"] = "http://example.com/scene"
    with pytest.raises(ValueError, match="HTTPS"):
        build_sentinel2_observation_rows(**inputs)


def test_refuses_no_valid_pixel_scene():
    inputs = _inputs()
    inputs["statistics"] = calculate_ndvi_statistics(
        [[1000, 1000], [1000, 1000]],
        [[3000, 3000], [3000, 3000]],
        scl=[[9, 9], [9, 9]],
    )
    with pytest.raises(ValueError, match="no valid pixels"):
        build_sentinel2_observation_rows(**inputs)


def test_rejects_malformed_https_source_urls():
    inputs = _inputs()
    inputs["source_url"] = "https://"
    with pytest.raises(ValueError, match="trusted Earth Search"):
        build_sentinel2_observation_rows(**inputs)

    inputs = _inputs()
    inputs["source_url"] = "https://example.com/forged-scene"
    with pytest.raises(ValueError, match="trusted Earth Search"):
        build_sentinel2_observation_rows(**inputs)


def test_rejects_non_finite_or_out_of_range_ndvi_statistics():
    from dataclasses import replace

    inputs = _inputs()
    inputs["statistics"] = replace(inputs["statistics"], mean_ndvi=float("nan"))
    with pytest.raises(ValueError, match="mean_ndvi"):
        build_sentinel2_observation_rows(**inputs)

    inputs = _inputs()
    inputs["statistics"] = replace(inputs["statistics"], median_ndvi=1.2)
    with pytest.raises(ValueError, match="median_ndvi"):
        build_sentinel2_observation_rows(**inputs)
