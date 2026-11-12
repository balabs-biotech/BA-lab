from datetime import datetime, timezone
from uuid import uuid4

import ba_environmental_engine.sources.sentinel2_batch as batch


def _item(scene_id):
    return {"id": scene_id}


def test_batch_keeps_processing_after_one_scene_fails(monkeypatch):
    calls = []

    def process(item, aoi, **kwargs):
        calls.append(item["id"])
        if item["id"] == "broken":
            raise ValueError("invalid raster")
        return {"scene_id": item["id"]}

    monkeypatch.setattr(batch, "process_sentinel2_stac_item", process)
    result = batch.process_sentinel2_stac_items(
        [_item("first"), _item("broken"), _item("last")],
        {"type": "Polygon", "coordinates": []},
        organization_id=uuid4(),
        location_id=uuid4(),
        retrieved_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
        processing_version="test-1",
    )

    assert calls == ["first", "broken", "last"]
    assert [entry.scene_id for entry in result.succeeded] == ["first", "last"]
    assert len(result.failed) == 1
    assert result.failed[0].scene_id == "broken"
    assert result.failed[0].error_type == "ValueError"


def test_batch_deduplicates_scene_ids_before_processing(monkeypatch):
    calls = []

    def process(item, aoi, **kwargs):
        calls.append(item["id"])
        return {"scene_id": item["id"]}

    monkeypatch.setattr(batch, "process_sentinel2_stac_item", process)
    result = batch.process_sentinel2_stac_items(
        [_item("same"), _item("same")],
        {"type": "Polygon", "coordinates": []},
        organization_id=uuid4(),
        location_id=uuid4(),
        retrieved_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
        processing_version="test-1",
    )

    assert calls == ["same"]
    assert result.duplicate_scene_ids == ("same",)
    assert len(result.succeeded) == 1


def test_batch_rejects_more_than_configured_limit():
    import pytest

    with pytest.raises(ValueError, match="max_scenes"):
        batch.process_sentinel2_stac_items(
            [_item(str(i)) for i in range(3)],
            {"type": "Polygon", "coordinates": []},
            organization_id=uuid4(),
            location_id=uuid4(),
            retrieved_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
            processing_version="test-1",
            max_scenes=2,
        )
