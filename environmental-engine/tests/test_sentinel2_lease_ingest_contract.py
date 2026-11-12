"""Static contract checks for the lease-bound Sentinel-2 Edge Function.

These checks protect the trust boundary without requiring a live Supabase
project. Runtime authorization and SQL behavior still require integration tests.
"""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EDGE_FUNCTION = (
    ROOT
    / "supabase"
    / "functions"
    / "earth-search-sentinel2-lease-ingest"
    / "index.ts"
)


def test_lease_ingest_is_server_to_server_and_does_not_require_user_jwt():
    source = EDGE_FUNCTION.read_text(encoding="utf-8")
    assert 'req.headers.get("authorization")' not in source
    assert "trusted_worker_signature_required" in source
    assert "BA_SENTINEL2_WORKER_SECRET" in source
    assert "verifySignature(rawBody" in source


def test_lease_ingest_checks_live_job_lease_and_source_contract():
    source = EDGE_FUNCTION.read_text(encoding="utf-8")
    assert '.eq("id", body.job_id).maybeSingle()' in source
    assert 'job.status !== "processing"' in source
    assert 'job.lease_token !== body.lease_token' in source
    assert "Date.parse(job.lease_expires_at) <= Date.now()" in source
    assert 'job.provider_code !== "EARTH_SEARCH"' in source
    assert 'job.dataset_code !== "SENTINEL_2_L2A"' in source
    assert "validateRows(body.rows, job.organization_id, job.location_id)" in source


def test_lease_ingest_persists_only_through_satellite_rpc():
    source = EDGE_FUNCTION.read_text(encoding="utf-8")
    assert '"upsert_satellite_environmental_observations"' in source
    assert "p_rows: body.rows" in source
    assert '.from("environmental_observations")' not in source
