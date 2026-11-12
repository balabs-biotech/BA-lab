from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_atomic_leased_satellite_persistence_locks_job_before_upsert():
    migration = ROOT / "supabase/migrations/20261112230000_add_atomic_leased_satellite_persistence.sql"
    sql = migration.read_text(encoding="utf-8")
    assert "persist_leased_satellite_environmental_observations" in sql
    assert "FOR UPDATE" in sql
    assert "lease_expires_at <= clock_timestamp()" in sql
    assert "v_job.lease_token IS DISTINCT FROM p_lease_token" in sql
    assert "upsert_satellite_environmental_observations(p_rows)" in sql
    assert sql.index("FOR UPDATE") < sql.index("upsert_satellite_environmental_observations(p_rows)")
    assert "GRANT EXECUTE" in sql and "TO service_role" in sql


def test_lease_ingest_edge_uses_atomic_rpc_not_read_then_write():
    edge = ROOT / "supabase/functions/earth-search-sentinel2-lease-ingest/index.ts"
    source = edge.read_text(encoding="utf-8")
    assert 'admin.rpc(\n      "persist_leased_satellite_environmental_observations"' in source
    assert 'admin.from("environmental_ingestion_jobs")' not in source
    assert '"upsert_satellite_environmental_observations"' not in source
    assert "validateRows(body.rows, body.organization_id, body.location_id)" in source
