from __future__ import annotations

import hashlib
import hmac
import json
from uuid import uuid4

import pytest

from ba_environmental_engine.execution.lease_ingest import (
    LeaseIngestTransportError,
    persist_leased_sentinel2_rows,
)


def _rows():
    scene = "S2A_TEST_SCENE"
    common = {
        "organization_id": str(uuid4()),
        "location_id": str(uuid4()),
        "data_family": "satellite",
        "provider_code": "EARTH_SEARCH",
        "dataset_code": "SENTINEL_2_L2A",
        "source_record_id": scene,
        "unit_code": "1",
        "observed_at": "2026-11-01T10:00:00+00:00",
        "retrieved_at": "2026-11-02T00:00:00+00:00",
        "quality_flag": "valid",
        "source_url": f"https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/{scene}",
        "metadata": {
            "scene_id": scene,
            "processing_version": "lease-worker-test-v1",
            "valid_pixel_ratio": 0.9,
            "cloud_cover_pct": 5.0,
        },
    }
    return [
        {**common, "variable_code": "ndvi_mean", "value": 0.5},
        {**common, "variable_code": "ndvi_median", "value": 0.4},
    ]


def test_lease_transport_signs_exact_body_without_user_credentials():
    secret = "ba-labs-test-secret-at-least-32-bytes"
    captured = {}
    rows = _rows()

    def fake_post(url, *, data, headers, timeout):
        captured.update(url=url, data=data, headers=headers, timeout=timeout)
        return {"ok": True, "observations_upserted": 2}

    result = persist_leased_sentinel2_rows(
        job_id=str(uuid4()),
        lease_token=str(uuid4()),
        organization_id=rows[0]["organization_id"],
        location_id=rows[0]["location_id"],
        rows=rows,
        ingest_url="https://example.supabase.co/functions/v1/earth-search-sentinel2-lease-ingest",
        worker_secret=secret,
        post=fake_post,
        timestamp_seconds=1793606400,
    )
    assert result["ok"] is True
    assert captured["timeout"] == 30
    assert captured["headers"]["x-ba-worker-timestamp"] == "1793606400"
    expected = hmac.new(
        secret.encode(),
        b"1793606400." + captured["data"],
        hashlib.sha256,
    ).hexdigest()
    assert captured["headers"]["x-ba-worker-signature"] == expected
    body = json.loads(captured["data"])
    assert body["job_id"]
    assert body["lease_token"]
    assert body["rows"][0]["source_record_id"] == "S2A_TEST_SCENE"
    assert "Authorization" not in captured["headers"]
    assert "apikey" not in captured["headers"]


@pytest.mark.parametrize("url", [
    "http://example.supabase.co/functions/v1/earth-search-sentinel2-lease-ingest",
    "https://attacker.example/functions/v1/earth-search-sentinel2-lease-ingest",
    "https://example.supabase.co/functions/v1/earth-search-sentinel2-ingest",
    "https://user@example.supabase.co/functions/v1/earth-search-sentinel2-lease-ingest",
    "https://example.supabase.co/functions/v1/earth-search-sentinel2-lease-ingest?x=1",
])
def test_rejects_untrusted_destination(url):
    rows = _rows()
    with pytest.raises(ValueError, match="trusted Supabase"):
        persist_leased_sentinel2_rows(
            job_id=str(uuid4()),
            lease_token=str(uuid4()),
            organization_id=rows[0]["organization_id"],
            location_id=rows[0]["location_id"],
            rows=rows,
            ingest_url=url,
            worker_secret="ba-labs-test-secret-at-least-32-bytes",
            post=lambda *args, **kwargs: {"ok": True},
        )


def test_rejects_invalid_lease_identifiers_and_unbounded_batches():
    rows = _rows()
    common = dict(
        organization_id=rows[0]["organization_id"],
        location_id=rows[0]["location_id"],
        rows=rows,
        ingest_url="https://example.supabase.co/functions/v1/earth-search-sentinel2-lease-ingest",
        worker_secret="ba-labs-test-secret-at-least-32-bytes",
        post=lambda *args, **kwargs: {"ok": True},
    )
    with pytest.raises(ValueError, match="lease_token"):
        persist_leased_sentinel2_rows(job_id=str(uuid4()), lease_token="bad", **common)
    with pytest.raises(ValueError, match="scene pairs"):
        persist_leased_sentinel2_rows(
            job_id=str(uuid4()), lease_token=str(uuid4()), rows=rows[:1], **{k:v for k,v in common.items() if k != "rows"}
        )


def test_remote_error_is_sanitized():
    rows = _rows()
    with pytest.raises(LeaseIngestTransportError, match="lease persistence request failed"):
        persist_leased_sentinel2_rows(
            job_id=str(uuid4()),
            lease_token=str(uuid4()),
            organization_id=rows[0]["organization_id"],
            location_id=rows[0]["location_id"],
            rows=rows,
            ingest_url="https://example.supabase.co/functions/v1/earth-search-sentinel2-lease-ingest",
            worker_secret="ba-labs-test-secret-at-least-32-bytes",
            post=lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("secret-token")),
        )
