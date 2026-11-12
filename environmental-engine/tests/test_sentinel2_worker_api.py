from uuid import uuid4

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient

import ba_environmental_engine.api.app as api


def _payload():
    return {
        "organization_id": str(uuid4()),
        "location_id": str(uuid4()),
        "aoi_geojson": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]},
        "items": [{
            "type": "Feature",
            "id": "S2A_API_TEST",
            "collection": "sentinel-2-l2a",
            "properties": {"datetime": "2026-10-01T10:00:00Z"},
            "assets": {},
            "links": [],
        }],
        "retrieved_at": "2026-10-02T00:00:00Z",
        "processing_version": "api-test-v1",
    }


def test_private_worker_route_forwards_user_jwt_and_validated_scope(monkeypatch):
    captured = {}
    monkeypatch.setenv(
        "BA_SENTINEL2_INGEST_URL",
        "https://axcouwiodqsauwnsiotn.supabase.co/functions/v1/earth-search-sentinel2-ingest",
    )
    monkeypatch.setenv("BA_SENTINEL2_WORKER_SECRET", "ba-labs-test-secret-at-least-32-bytes")

    def fake_process(**kwargs):
        captured.update(kwargs)
        return type("Result", (), {
            "items_received": 1,
            "scenes_processed": 1,
            "scenes_failed": 0,
            "scenes_duplicated": 0,
            "quality_rejected_scenes": 0,
            "observations_submitted": 2,
            "scene_failures": (),
            "persistence_response": {"ok": True, "observations_upserted": 2},
        })()

    monkeypatch.setattr(api, "process_and_persist_sentinel2_batch", fake_process)
    client = TestClient(api.create_app(engine_api_key="internal-test-key"))
    payload = _payload()
    response = client.post(
        "/v1/sentinel2/process-and-persist",
        json=payload,
        headers={
            "X-BA-Engine-Key": "internal-test-key",
            "Authorization": "Bearer end-user-jwt",
            "apikey": "test-publishable-key",
        },
    )

    assert response.status_code == 200
    assert response.json()["observations_submitted"] == 2
    assert captured["user_authorization"] == "Bearer end-user-jwt"
    assert captured["supabase_api_key"] == "test-publishable-key"
    assert str(captured["organization_id"]) == payload["organization_id"]
    assert str(captured["location_id"]) == payload["location_id"]


def test_private_worker_route_requires_user_jwt(monkeypatch):
    monkeypatch.setenv(
        "BA_SENTINEL2_INGEST_URL",
        "https://axcouwiodqsauwnsiotn.supabase.co/functions/v1/earth-search-sentinel2-ingest",
    )
    monkeypatch.setenv("BA_SENTINEL2_WORKER_SECRET", "ba-labs-test-secret-at-least-32-bytes")
    client = TestClient(api.create_app(engine_api_key="internal-test-key"))
    response = client.post(
        "/v1/sentinel2/process-and-persist",
        json=_payload(),
        headers={"X-BA-Engine-Key": "internal-test-key"},
    )
    assert response.status_code == 401


def test_private_worker_route_rejects_invalid_stac_item(monkeypatch):
    monkeypatch.setenv(
        "BA_SENTINEL2_INGEST_URL",
        "https://axcouwiodqsauwnsiotn.supabase.co/functions/v1/earth-search-sentinel2-ingest",
    )
    monkeypatch.setenv("BA_SENTINEL2_WORKER_SECRET", "ba-labs-test-secret-at-least-32-bytes")
    payload = _payload()
    payload["items"][0]["id"] = 123
    client = TestClient(api.create_app(engine_api_key="internal-test-key"))
    response = client.post(
        "/v1/sentinel2/process-and-persist",
        json=payload,
        headers={
            "X-BA-Engine-Key": "internal-test-key",
            "Authorization": "Bearer end-user-jwt",
        },
    )
    assert response.status_code == 422
