from datetime import datetime, timezone

import pytest

from ba_environmental_engine.sources.sentinel2_stac import parse_sentinel2_stac_item


def _item():
    return {
        "type": "Feature",
        "id": "S2A_MSIL2A_20261001T102021_N0500_R065_T31TCJ_20261001T130000",
        "collection": "sentinel-2-l2a",
        "properties": {
            "datetime": "2026-10-01T10:20:21Z",
            "eo:cloud_cover": 14.2,
            "proj:epsg": 32631,
        },
        "assets": {
            "red": {"href": "https://example-bucket.s3.amazonaws.com/scene/B04.tif"},
            "nir": {"href": "https://example-bucket.s3.amazonaws.com/scene/B08.tif"},
            "scl": {"href": "https://example-bucket.s3.amazonaws.com/scene/SCL.tif"},
        },
        "links": [
            {"rel": "self", "href": "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/scene"}
        ],
    }


def test_parses_minimum_scientific_scene_assets_and_provenance():
    scene = parse_sentinel2_stac_item(_item())

    assert scene.scene_id.startswith("S2A_MSIL2A")
    assert scene.observed_at == datetime(2026, 10, 1, 10, 20, 21, tzinfo=timezone.utc)
    assert scene.cloud_cover_pct == pytest.approx(14.2)
    assert scene.epsg == 32631
    assert scene.red_asset_url.endswith("B04.tif")
    assert scene.nir_asset_url.endswith("B08.tif")
    assert scene.scl_asset_url.endswith("SCL.tif")


def test_rejects_missing_scl_in_scientific_mode():
    item = _item()
    del item["assets"]["scl"]
    with pytest.raises(ValueError, match="SCL"):
        parse_sentinel2_stac_item(item)


def test_rejects_untrusted_asset_host():
    item = _item()
    item["assets"]["red"]["href"] = "https://attacker.invalid/B04.tif"
    with pytest.raises(ValueError, match="trusted"):
        parse_sentinel2_stac_item(item)


def test_rejects_invalid_cloud_cover_and_timestamp():
    item = _item()
    item["properties"]["eo:cloud_cover"] = 120
    with pytest.raises(ValueError, match="cloud_cover"):
        parse_sentinel2_stac_item(item)
