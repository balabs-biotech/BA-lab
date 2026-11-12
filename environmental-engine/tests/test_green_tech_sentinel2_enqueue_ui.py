from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_green_tech_panel_invokes_authenticated_enqueue_function():
    panel = (ROOT / "batch-tracker/environmental-jobs-panel.js").read_text(encoding="utf-8")
    entry = (ROOT / "batch-tracker/green-tech/index.html").read_text(encoding="utf-8")
    assert 'client.functions.invoke(' in panel
    assert '"earth-search-sentinel2-enqueue"' in panel
    assert "location_id: selectedLocation" in panel
    assert "start_date: startDate.value" in panel
    assert "end_date: endDate.value" in panel
    assert "max_cloud_cover_pct: cloud" in panel
    assert "max_scenes: scenes" in panel
    assert "data?.job_id" in panel
    assert "environmental-jobs-panel.js" in entry


def test_green_tech_enqueue_form_has_client_side_bounds_and_mobile_styles():
    panel = (ROOT / "batch-tracker/environmental-jobs-panel.js").read_text(encoding="utf-8")
    css = (ROOT / "batch-tracker/tracker.css").read_text(encoding="utf-8")
    assert "days > 90" in panel
    assert "cloud > 100" in panel
    assert "scenes > 10" in panel
    assert "environmental-job-request" in css
    assert "@media (max-width: 560px)" in css
