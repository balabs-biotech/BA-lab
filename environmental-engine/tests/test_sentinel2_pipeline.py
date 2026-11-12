from datetime import datetime, timezone
from uuid import uuid4

import numpy as np
import pytest

rasterio = pytest.importorskip("rasterio")
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from rasterio.warp import transform

from ba_environmental_engine.sources.sentinel2_pipeline import process_sentinel2_stac_item


def _memory_raster(array, transform_, dtype):
    mem = MemoryFile()
    with mem.open(
        driver="GTiff",
        height=array.shape[0],
        width=array.shape[1],
        count=1,
        dtype=dtype,
        crs="EPSG:32631",
        transform=transform_,
    ) as dataset:
        dataset.write(array.astype(dtype), 1)
    return mem


def test_processes_stac_scene_into_auditable_observation_rows():
    red_url = "https://example-bucket.s3.amazonaws.com/red.tif"
    nir_url = "https://example-bucket.s3.amazonaws.com/nir.tif"
    scl_url = "https://example-bucket.s3.amazonaws.com/scl.tif"
    item_url = "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_PIPELINE"
    red = _memory_raster(np.full((4, 4), 1000), from_origin(500000, 1000, 10, 10), "uint16")
    nir = _memory_raster(np.full((4, 4), 3000), from_origin(500000, 1000, 10, 10), "uint16")
    scl = _memory_raster(
        np.array([[4, 3], [4, 4]], dtype=np.uint8),
        from_origin(500000, 1000, 20, 20),
        "uint8",
    )
    assets = {red_url: red, nir_url: nir, scl_url: scl}
    xs, ys = transform("EPSG:32631", "EPSG:4326", [500001, 500019], [981, 999])
    aoi = {"type": "Polygon", "coordinates": [[
        [xs[0], ys[0]], [xs[1], ys[0]], [xs[1], ys[1]],
        [xs[0], ys[1]], [xs[0], ys[0]],
    ]]}
    item = {
        "type": "Feature",
        "collection": "sentinel-2-l2a",
        "id": "S2A_PIPELINE",
        "properties": {
            "datetime": "2026-10-01T10:00:00Z",
            "eo:cloud_cover": 4.5,
            "proj:epsg": 32631,
        },
        "assets": {
            "red": {"href": red_url},
            "nir": {"href": nir_url},
            "scl": {"href": scl_url},
        },
        "links": [{"rel": "self", "href": item_url}],
    }

    result = process_sentinel2_stac_item(
        item,
        aoi,
        organization_id=uuid4(),
        location_id=uuid4(),
        retrieved_at=datetime(2026, 10, 2, tzinfo=timezone.utc),
        processing_version="ba-s2-native-v1",
        opener=lambda url: assets[url].open(),
    )

    assert result.scene.scene_id == "S2A_PIPELINE"
    assert result.raster.spatial_resolution_m == pytest.approx(10)
    assert [row["variable_code"] for row in result.observation_rows] == ["ndvi_mean", "ndvi_median"]
    assert all(row["metadata"]["scene_id"] == "S2A_PIPELINE" for row in result.observation_rows)
    assert all(row["source_url"] == item_url for row in result.observation_rows)
    assert all(row["metadata"]["valid_pixel_count"] == 2 for row in result.observation_rows)
    red.close()
    nir.close()
    scl.close()
