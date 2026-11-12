from __future__ import annotations

from datetime import datetime, timezone
from threading import Event
from uuid import uuid4

import pytest

from ba_environmental_engine.execution.sentinel2_job_processor import (
    LeasedSentinel2JobProcessor,
    make_location_aoi,
)


class _Response:
    def json(self):
        return {"features": [_item()], "links": []}

    def raise_for_status(self):
        return None


def _item():
    return {
        "type": "Feature",
        "collection": "sentinel-2-l2a",
        "id": "S2A_TEST_SCENE",
        "properties": {
            "datetime": "2026-11-01T10:00:00Z",
            "eo:cloud_cover": 5.0,
            "proj:epsg": 32631,
        },
        "assets": {
            "red": {"href": "https://data.s3.amazonaws.com/B04.tif"},
            "nir": {"href": "https://data.s3.amazonaws.com/B08.tif"},
            "scl": {"href": "https://data.s3.amazonaws.com/SCL.tif"},
        },
        "links": [{
            "rel": "self",
            "href": "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_TEST_SCENE",
        }],
    }


def _rows(org, location):
    common = {
        "organization_id": org,
        "location_id": location,
        "data_family": "satellite",
        "provider_code": "EARTH_SEARCH",
        "dataset_code": "SENTINEL_2_L2A",
        "source_record_id": "S2A_TEST_SCENE",
        "unit_code": "1",
        "observed_at": "2026-11-01T10:00:00+00:00",
        "retrieved_at": "2026-11-12T00:00:00+00:00",
        "quality_flag": "valid",
        "source_url": "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_TEST_SCENE",
        "metadata": {
            "scene_id": "S2A_TEST_SCENE",
            "processing_version": "test-v1",
            "valid_pixel_ratio": 0.9,
            "cloud_cover_pct": 5.0,
        },
    }
    return (
        {**common, "variable_code": "ndvi_mean", "value": 0.5},
        {**common, "variable_code": "ndvi_median", "value": 0.4},
    )


class _Locations:
    def __init__(self, location):
        self.location = location
        self.calls = []

    def get_for_job(self, **kwargs):
        self.calls.append(kwargs)
        return {"latitude": 36.19, "longitude": 5.41, **self.location}


def _job():
    return {
        "id": str(uuid4()),
        "lease_token": str(uuid4()),
        "organization_id": str(uuid4()),
        "location_id": str(uuid4()),
        "job_type": "sentinel2_scene_ingestion",
        "provider_code": "EARTH_SEARCH",
        "dataset_code": "SENTINEL_2_L2A",
        "request_parameters": {
            "start_date": "2026-11-01",
            "end_date": "2026-11-10",
            "max_cloud_cover_pct": 20,
            "max_scenes": 4,
        },
    }


def test_processor_composes_location_search_processing_and_lease_persistence(monkeypatch):
    import ba_environmental_engine.execution.sentinel2_job_processor as module

    job = _job()
    rows = _rows(job["organization_id"], job["location_id"])
    locations = _Locations({})
    persisted = {}

    class SceneResult:
        observation_rows = rows

    class Batch:
        succeeded = (SceneResult(),)
        failed = ()
        duplicate_scene_ids = ()
        items_received = 1
        success_count = 1
        failure_count = 0

    monkeypatch.setattr(module, "process_sentinel2_stac_items", lambda *a, **k: Batch())
    processor = LeasedSentinel2JobProcessor(
        locations=locations,
        stac_request=lambda **kwargs: _Response(),
        ingest_url="https://example.supabase.co/functions/v1/earth-search-sentinel2-lease-ingest",
        worker_secret="ba-labs-test-secret-at-least-32-bytes",
        clock=lambda: datetime(2026, 11, 12, tzinfo=timezone.utc),
        persist=lambda **kwargs: persisted.update(kwargs) or {
            "ok": True, "observations_upserted": 2
        },
    )
    outcome = processor(job, Event())
    assert outcome.status == "succeeded"
    assert outcome.scenes_processed == 1
    assert outcome.observations_submitted == 2
    assert locations.calls == [{
        "location_id": job["location_id"],
        "organization_id": job["organization_id"],
    }]
    assert persisted["job_id"] == job["id"]
    assert persisted["lease_token"] == job["lease_token"]
    assert len(persisted["rows"]) == 2


def test_processor_stops_before_location_lookup_when_lease_is_lost():
    job = _job()
    locations = _Locations({})
    processor = LeasedSentinel2JobProcessor(
        locations=locations,
        stac_request=lambda **kwargs: _Response(),
        ingest_url="https://example.supabase.co/functions/v1/earth-search-sentinel2-lease-ingest",
        worker_secret="ba-labs-test-secret-at-least-32-bytes",
        clock=lambda: datetime(2026, 11, 12, tzinfo=timezone.utc),
    )
    stopped = Event()
    stopped.set()
    with pytest.raises(InterruptedError, match="lease loss"):
        processor(job, stopped)
    assert locations.calls == []


def test_processor_rejects_future_and_overlong_job_ranges():
    job = _job()
    locations = _Locations({})
    processor = LeasedSentinel2JobProcessor(
        locations=locations,
        stac_request=lambda **kwargs: _Response(),
        ingest_url="https://example.supabase.co/functions/v1/earth-search-sentinel2-lease-ingest",
        worker_secret="ba-labs-test-secret-at-least-32-bytes",
        clock=lambda: datetime(2026, 11, 12, tzinfo=timezone.utc),
    )
    job["request_parameters"]["end_date"] = "2026-11-13"
    with pytest.raises(ValueError, match="future"):
        processor(job, Event())
    job["request_parameters"]["start_date"] = "2026-01-01"
    job["request_parameters"]["end_date"] = "2026-11-10"
    with pytest.raises(ValueError, match="90 days"):
        processor(job, Event())


def test_location_aoi_matches_approximate_buffer_and_rejects_invalid_coordinates():
    aoi = make_location_aoi(36.19, 5.41)
    ring = aoi["coordinates"][0]
    assert ring[0] == ring[-1]
    assert len(ring) == 5
    with pytest.raises(ValueError):
        make_location_aoi(91, 5.41)
