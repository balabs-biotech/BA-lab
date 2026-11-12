from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_enqueue_gateway_authenticates_and_inserts_only_bounded_job_parameters():
    source = (
        ROOT / "supabase/functions/earth-search-sentinel2-enqueue/index.ts"
    ).read_text(encoding="utf-8")
    assert "auth.getUser()" in source
    assert 'from("locations")' in source
    assert 'from("organization_members")' in source
    assert 'from("environmental_ingestion_jobs")' in source
    assert 'status: "queued"' in source
    assert '"start_date":' not in source  # object uses unquoted TypeScript keys
    assert "start_date: startDate" in source
    assert "end_date: endDate" in source
    assert "max_cloud_cover_pct: cloudLimit" in source
    assert "max_scenes: requestedScenes" in source
    assert "requested_by: authData.user.id" in source
    assert "authorization" not in source.split(".insert({", 1)[1].split("})", 1)[0]
    assert "STAC_SEARCH_URL" not in source
    assert "fetch(" not in source
    assert "202" in source


def test_enqueue_gateway_enforces_scene_and_date_bounds():
    source = (
        ROOT / "supabase/functions/earth-search-sentinel2-enqueue/index.ts"
    ).read_text(encoding="utf-8")
    assert "MAX_DAYS = 90" in source
    assert "MAX_SCENES = 10" in source
    assert "date_range_exceeds_90_days" in source
    assert "future_date_range_not_allowed" in source
    assert "max_cloud_cover_pct_must_be_between_0_and_100" in source
