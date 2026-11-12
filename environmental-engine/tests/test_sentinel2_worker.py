from datetime import datetime, timezone
import hashlib
import hmac
import json
from uuid import uuid4

import pytest

from ba_environmental_engine.sources.sentinel2_worker import (
    Sentinel2PersistenceError,
    process_and_persist_sentinel2_batch,
)


class _Scene:
    def __init__(self, rows):
        self.observation_rows = rows


def _rows(scene_id="S2A_TEST", quality="valid"):
    common = {
        "organization_id": str(uuid4()),
        "location_id": str(uuid4()),
        "data_family": "satellite",
        "provider_code": "EARTH_SEARCH",
        "dataset_code": "SENTINEL_2_L2A",
        "source_record_id": scene_id,
        "unit_code": "1",
        "observed_at": "2026-10-01T10:00:00+00:00",
        "retrieved_at": "2026-10-02T00:00:00+00:00",
        "quality_flag": quality,
        "source_url": f"https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/{scene_id}",
        "metadata": {
            "scene_id": scene_id,
            "processing_version": "worker-test-v1",
            "valid_pixel_ratio": 0.9,
            "cloud_cover_pct": 5.0,
        },
    }
    return (
        {**common, "variable_code": "ndvi_mean", "value": 0.5},
        {**common, "variable_code": "ndvi_median", "value": 0.4},
    )


def test_worker_signs_payload_and_forwards_callers_jwt(monkeypatch):
    import ba_environmental_engine.sources.sentinel2_worker as worker

    monkeypatch.setattr(
        worker,
        "process_sentinel2_stac_items",
        lambda *args, **kwargs: type("Batch", (), {
            "succeeded": (_Scene(_rows()),),
            "failed": (),
            "duplicate_scene_ids": (),
            "items_received": 1,
        })(),
    )
    captured = {}

    def fake_post(url, *, data, headers, timeout):
        captured.update(url=url, data=data, headers=headers, timeout=timeout)
        return {"ok": True, "observations_upserted": 2}

    result = process_and_persist_sentinel2_batch(
        items=[{"id": "S2A_TEST"}],
        aoi_geojson={"type": "Polygon", "coordinates": []},
        organization_id=uuid4(),
        location_id=uuid4(),
        retrieved_at=datetime(2026, 10, 2, tzinfo=timezone.utc),
        processing_version="worker-test-v1",
        user_authorization="Bearer user-jwt",
        supabase_api_key="test-publishable-key",
        ingest_url="https://example.supabase.co/functions/v1/earth-search-sentinel2-ingest",
        worker_secret="ba-labs-test-secret-at-least-32-bytes",
        post=fake_post,
        timestamp_seconds=1790928000,
    )

    assert result.observations_submitted == 2
    assert captured["headers"]["Authorization"] == "Bearer user-jwt"
    assert captured["headers"]["apikey"] == "test-publishable-key"
    assert captured["headers"]["x-ba-worker-timestamp"] == "1790928000"
    assert len(captured["headers"]["x-ba-worker-signature"]) == 64
    expected_signature = hmac.new(
        b"ba-labs-test-secret-at-least-32-bytes",
        b"1790928000." + captured["data"],
        hashlib.sha256,
    ).hexdigest()
    assert captured["headers"]["x-ba-worker-signature"] == expected_signature
    assert json.loads(captured["data"])["rows"][0]["source_record_id"] == "S2A_TEST"
    assert captured["timeout"] == 30


def test_worker_does_not_persist_insufficient_quality_scenes(monkeypatch):
    import ba_environmental_engine.sources.sentinel2_worker as worker

    monkeypatch.setattr(
        worker,
        "process_sentinel2_stac_items",
        lambda *args, **kwargs: type("Batch", (), {
            "succeeded": (_Scene(_rows(quality="insufficient_valid_pixels")),),
            "failed": (),
            "duplicate_scene_ids": (),
            "items_received": 1,
        })(),
    )
    calls = []
    result = process_and_persist_sentinel2_batch(
        items=[{"id": "S2A_TEST"}],
        aoi_geojson={"type": "Polygon", "coordinates": []},
        organization_id=uuid4(),
        location_id=uuid4(),
        retrieved_at=datetime(2026, 10, 2, tzinfo=timezone.utc),
        processing_version="worker-test-v1",
        user_authorization="Bearer user-jwt",
        supabase_api_key="test-publishable-key",
        ingest_url="https://example.supabase.co/functions/v1/earth-search-sentinel2-ingest",
        worker_secret="ba-labs-test-secret-at-least-32-bytes",
        post=lambda *args, **kwargs: calls.append(args),
        timestamp_seconds=1790928000,
    )
    assert result.observations_submitted == 0
    assert result.quality_rejected_scenes == 1
    assert calls == []


def test_worker_rejects_non_supabase_ingest_destination_before_processing():
    with pytest.raises(ValueError, match="trusted Supabase"):
        process_and_persist_sentinel2_batch(
            items=[],
            aoi_geojson={"type": "Polygon", "coordinates": []},
            organization_id=uuid4(),
            location_id=uuid4(),
            retrieved_at=datetime(2026, 10, 2, tzinfo=timezone.utc),
            processing_version="worker-test-v1",
            user_authorization="Bearer user-jwt",
            supabase_api_key="test-publishable-key",
            ingest_url="https://attacker.example/collect",
            worker_secret="ba-labs-test-secret-at-least-32-bytes",
            post=lambda *args, **kwargs: {},
            timestamp_seconds=1790928000,
        )


def test_worker_rejects_missing_caller_authorization():
    with pytest.raises(ValueError, match="caller bearer token"):
        process_and_persist_sentinel2_batch(
            items=[],
            aoi_geojson={"type": "Polygon", "coordinates": []},
            organization_id=uuid4(),
            location_id=uuid4(),
            retrieved_at=datetime(2026, 10, 2, tzinfo=timezone.utc),
            processing_version="worker-test-v1",
            user_authorization="",
            supabase_api_key="test-publishable-key",
            ingest_url="https://example.supabase.co/functions/v1/earth-search-sentinel2-ingest",
            worker_secret="ba-labs-test-secret-at-least-32-bytes",
            post=lambda *args, **kwargs: {},
            timestamp_seconds=1790928000,
        )


def test_worker_does_not_expose_remote_error_body():
    import ba_environmental_engine.sources.sentinel2_worker as worker

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(
        worker,
        "process_sentinel2_stac_items",
        lambda *args, **kwargs: type("Batch", (), {
            "succeeded": (_Scene(_rows()),),
            "failed": (),
            "duplicate_scene_ids": (),
            "items_received": 1,
        })(),
    )
    try:
        with pytest.raises(Sentinel2PersistenceError, match="remote persistence request failed"):
            process_and_persist_sentinel2_batch(
                items=[{"id": "S2A_TEST"}],
                aoi_geojson={"type": "Polygon", "coordinates": []},
                organization_id=uuid4(),
                location_id=uuid4(),
                retrieved_at=datetime(2026, 10, 2, tzinfo=timezone.utc),
                processing_version="worker-test-v1",
                user_authorization="Bearer user-jwt",
                supabase_api_key="test-publishable-key",
                ingest_url="https://example.supabase.co/functions/v1/earth-search-sentinel2-ingest",
                worker_secret="ba-labs-test-secret-at-least-32-bytes",
                post=lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("secret query token")),
                timestamp_seconds=1790928000,
            )
    finally:
        monkeypatch.undo()


def test_worker_returns_sanitized_per_scene_failure_summary(monkeypatch):
    import ba_environmental_engine.sources.sentinel2_worker as worker

    failure = type("Failure", (), {
        "scene_id": "S2A_FAILED",
        "error_type": "RasterioIOError",
        "message": "https://private.example/object?signature=secret",
    })()
    monkeypatch.setattr(
        worker,
        "process_sentinel2_stac_items",
        lambda *args, **kwargs: type("Batch", (), {
            "succeeded": (),
            "failed": (failure,),
            "duplicate_scene_ids": (),
            "items_received": 1,
        })(),
    )
    result = process_and_persist_sentinel2_batch(
        items=[{"id": "S2A_FAILED"}],
        aoi_geojson={"type": "Polygon", "coordinates": []},
        organization_id=uuid4(),
        location_id=uuid4(),
        retrieved_at=datetime(2026, 10, 2, tzinfo=timezone.utc),
        processing_version="worker-test-v1",
        user_authorization="Bearer user-jwt",
        supabase_api_key="test-publishable-key",
        ingest_url="https://example.supabase.co/functions/v1/earth-search-sentinel2-ingest",
        worker_secret="ba-labs-test-secret-at-least-32-bytes",
        post=lambda *args, **kwargs: {},
        timestamp_seconds=1790928000,
    )
    assert result.scenes_failed == 1
    assert result.scene_failures == ({
        "scene_id": "S2A_FAILED",
        "error_type": "RasterioIOError",
    },)
    assert "signature" not in str(result.scene_failures)
