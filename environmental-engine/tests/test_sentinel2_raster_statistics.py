import numpy as np
import pytest

from ba_environmental_engine.sources.sentinel2_raster import (
    calculate_ndvi_statistics,
)


def test_calculates_native_pixel_ndvi_and_excludes_invalid_scl_classes():
    red = np.array([[1000, 1000, 1000], [1000, 1000, 1000]], dtype=np.float32)
    nir = np.array([[3000, 1000, 500, 3000, 3000, 3000]], dtype=np.float32).reshape(2, 3)
    scl = np.array([[4, 3, 8], [4, 7, 4]], dtype=np.uint8)

    result = calculate_ndvi_statistics(red, nir, scl=scl)

    assert result.valid_pixel_count == 2
    assert result.total_pixel_count == 6
    assert result.valid_pixel_ratio == pytest.approx(2 / 6)
    assert result.mean_ndvi == pytest.approx(0.5)
    assert result.median_ndvi == pytest.approx(0.5)
    assert result.min_ndvi == pytest.approx(0.5)
    assert result.max_ndvi == pytest.approx(0.5)
    assert result.masked_scl_classes == (3, 7, 8)
    assert result.quality_flag == "valid"


def test_invalid_reflectance_and_zero_denominator_are_excluded():
    red = np.array([[1000, 0, 1000]], dtype=np.float32)
    nir = np.array([[3000, 2000, -1000]], dtype=np.float32)

    result = calculate_ndvi_statistics(red, nir)

    assert result.valid_pixel_count == 1
    assert result.mean_ndvi == pytest.approx(0.5)


def test_low_valid_pixel_ratio_is_flagged_without_hiding_statistics():
    red = np.full((2, 2), 1000, dtype=np.float32)
    nir = np.full((2, 2), 3000, dtype=np.float32)
    scl = np.array([[4, 3], [8, 9]], dtype=np.uint8)

    result = calculate_ndvi_statistics(red, nir, scl=scl, minimum_valid_ratio=0.5)

    assert result.valid_pixel_count == 1
    assert result.valid_pixel_ratio == pytest.approx(0.25)
    assert result.mean_ndvi == pytest.approx(0.5)
    assert result.quality_flag == "insufficient_valid_pixels"


def test_rejects_unaligned_scl_grid_instead_of_silently_resampling():
    red = np.ones((2, 2), dtype=np.float32)
    nir = np.full((2, 2), 3, dtype=np.float32)
    scl = np.ones((1, 1), dtype=np.uint8)

    with pytest.raises(ValueError, match="same shape"):
        calculate_ndvi_statistics(red, nir, scl=scl)


def test_no_valid_pixels_returns_explicit_quality_state():
    red = np.full((2, 2), 1000, dtype=np.float32)
    nir = np.full((2, 2), 3000, dtype=np.float32)
    scl = np.full((2, 2), 9, dtype=np.uint8)

    result = calculate_ndvi_statistics(red, nir, scl=scl)

    assert result.valid_pixel_count == 0
    assert result.valid_pixel_ratio == 0
    assert result.mean_ndvi is None
    assert result.quality_flag == "no_valid_pixels"
