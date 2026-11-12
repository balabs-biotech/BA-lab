from datetime import datetime, timezone

import numpy as np
import pytest

rasterio = pytest.importorskip("rasterio")
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from ba_environmental_engine.sources.sentinel2_raster_reader import (
    read_sentinel2_ndvi_window,
)
from ba_environmental_engine.sources.sentinel2_stac import Sentinel2StacScene


def _scene():
    return Sentinel2StacScene(
        scene_id="S2A_TEST",
        observed_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        cloud_cover_pct=2.0,
        epsg=32631,
        red_asset_url="https://example-bucket.s3.amazonaws.com/red.tif",
        nir_asset_url="https://example-bucket.s3.amazonaws.com/nir.tif",
        scl_asset_url="https://example-bucket.s3.amazonaws.com/scl.tif",
        item_url="https://earth-search.aws.element84.com/v1/items/S2A_TEST",
    )


def _memory_raster(array, *, transform, crs="EPSG:32631", dtype="uint16"):
    mem = MemoryFile()
    with mem.open(
        driver="GTiff",
        height=array.shape[0],
        width=array.shape[1],
        count=1,
        dtype=dtype,
        crs=crs,
        transform=transform,
    ) as dataset:
        dataset.write(array.astype(dtype), 1)
    return mem


def test_reads_aoi_window_and_aligns_20m_scl_to_10m_band_grid():
    # 4x4 red/NIR grid at 10 m; 2x2 SCL grid at 20 m over the same footprint.
    red = _memory_raster(np.full((4, 4), 1000), transform=from_origin(500000, 1000, 10, 10))
    nir = _memory_raster(np.full((4, 4), 3000), transform=from_origin(500000, 1000, 10, 10))
    scl = _memory_raster(
        np.array([[4, 3], [4, 4]], dtype=np.uint8),
        transform=from_origin(500000, 1000, 20, 20),
        dtype="uint8",
    )
    assets = {
        "https://example-bucket.s3.amazonaws.com/red.tif": red,
        "https://example-bucket.s3.amazonaws.com/nir.tif": nir,
        "https://example-bucket.s3.amazonaws.com/scl.tif": scl,
    }

    def opener(url):
        return assets[url].open()

    # WGS84 polygon corresponding to a small interior portion of the test grid.
    from rasterio.warp import transform

    xs, ys = transform("EPSG:32631", "EPSG:4326", [500001, 500019], [981, 999])
    geometry = {
        "type": "Polygon",
        "coordinates": [[
            [xs[0], ys[0]], [xs[1], ys[0]], [xs[1], ys[1]],
            [xs[0], ys[1]], [xs[0], ys[0]],
        ]],
    }

    result = read_sentinel2_ndvi_window(_scene(), geometry, opener=opener)

    assert result.statistics.total_pixel_count == 4
    assert result.statistics.valid_pixel_count == 2
    assert result.statistics.mean_ndvi == pytest.approx(0.5)
    assert result.spatial_resolution_m == pytest.approx(10.0)
    assert result.crs == "EPSG:32631"
    red.close()
    nir.close()
    scl.close()


def test_rejects_red_nir_grid_mismatch_before_calculation():
    red = _memory_raster(np.full((4, 4), 1000), transform=from_origin(500000, 1000, 10, 10))
    nir = _memory_raster(np.full((4, 4), 3000), transform=from_origin(500010, 1000, 10, 10))
    scl = _memory_raster(np.full((2, 2), 4), transform=from_origin(500000, 1000, 20, 20), dtype="uint8")
    assets = {
        "https://example-bucket.s3.amazonaws.com/red.tif": red,
        "https://example-bucket.s3.amazonaws.com/nir.tif": nir,
        "https://example-bucket.s3.amazonaws.com/scl.tif": scl,
    }

    with pytest.raises(ValueError, match="share the same CRS, transform and dimensions"):
        read_sentinel2_ndvi_window(
            _scene(),
            {"type": "Polygon", "coordinates": [[[3, 0], [3.001, 0], [3.001, .001], [3, .001], [3, 0]]]},
            opener=lambda url: assets[url].open(),
        )
    red.close()
    nir.close()
    scl.close()


def test_enforces_aoi_pixel_budget():
    red = _memory_raster(np.full((4, 4), 1000), transform=from_origin(500000, 1000, 10, 10))
    nir = _memory_raster(np.full((4, 4), 3000), transform=from_origin(500000, 1000, 10, 10))
    scl = _memory_raster(np.full((2, 2), 4), transform=from_origin(500000, 1000, 20, 20), dtype="uint8")
    assets = {
        "https://example-bucket.s3.amazonaws.com/red.tif": red,
        "https://example-bucket.s3.amazonaws.com/nir.tif": nir,
        "https://example-bucket.s3.amazonaws.com/scl.tif": scl,
    }
    from rasterio.warp import transform

    xs, ys = transform("EPSG:32631", "EPSG:4326", [500001, 500039], [961, 999])
    geometry = {"type": "Polygon", "coordinates": [[
        [xs[0], ys[0]], [xs[1], ys[0]], [xs[1], ys[1]],
        [xs[0], ys[1]], [xs[0], ys[0]],
    ]]}

    with pytest.raises(ValueError, match="pixel budget"):
        read_sentinel2_ndvi_window(_scene(), geometry, opener=lambda url: assets[url].open(), max_pixels=3)
    red.close()
    nir.close()
    scl.close()
