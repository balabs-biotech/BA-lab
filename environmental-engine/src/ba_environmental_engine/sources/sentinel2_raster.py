"""Native-grid Sentinel-2 NDVI statistics with explicit SCL quality masking.

This module operates on already co-registered raster arrays. It deliberately
does not fetch imagery, reproject bands, resample the 20 m SCL grid, or create
display previews. Those operations belong to the raster-ingestion boundary.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np


# Sentinel-2 Scene Classification Layer classes excluded from scientific NDVI:
# 0 no data, 1 saturated/defective, 3 cloud shadow, 7 unclassified,
# 8 medium-probability cloud, 9 high-probability cloud, 10 cirrus, 11 snow/ice.
_EXCLUDED_SCL_CLASSES = (0, 1, 3, 7, 8, 9, 10, 11)


@dataclass(frozen=True, slots=True)
class Sentinel2NdviStatistics:
    """Summary statistics calculated from valid, co-registered source pixels."""

    mean_ndvi: float | None
    median_ndvi: float | None
    min_ndvi: float | None
    max_ndvi: float | None
    valid_pixel_count: int
    total_pixel_count: int
    valid_pixel_ratio: float
    masked_scl_classes: tuple[int, ...]
    quality_flag: str


def _raster(values: Any, name: str) -> np.ndarray:
    try:
        array = np.asarray(values, dtype=np.float64)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a numeric 2D raster") from exc
    if array.ndim != 2 or array.size == 0:
        raise ValueError(f"{name} must be a non-empty 2D raster")
    return array


def calculate_ndvi_statistics(
    red: Any,
    nir: Any,
    *,
    scl: Any | None = None,
    minimum_valid_ratio: float = 0.2,
    red_scale: float = 1.0,
    nir_scale: float = 1.0,
    red_offset: float = 0.0,
    nir_offset: float = 0.0,
) -> Sentinel2NdviStatistics:
    """Calculate NDVI statistics on native, co-registered pixels.

    Red and NIR must already share the same native grid. If supplied, SCL must
    be aligned to that grid using a documented nearest-neighbour operation at
    the ingestion boundary; this function never silently resamples it.
    Reflectance values must be finite and positive. Excluded SCL classes are
    removed from the valid-pixel population.
    """
    if (
        isinstance(minimum_valid_ratio, bool)
        or not isinstance(minimum_valid_ratio, (int, float))
        or not np.isfinite(minimum_valid_ratio)
        or not 0 <= minimum_valid_ratio <= 1
    ):
        raise ValueError("minimum_valid_ratio must be between 0 and 1")

    for name, value, positive in (
        ("red_scale", red_scale, True),
        ("nir_scale", nir_scale, True),
        ("red_offset", red_offset, False),
        ("nir_offset", nir_offset, False),
    ):
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not np.isfinite(value)
            or (positive and value <= 0)
        ):
            qualifier = "positive and finite" if positive else "finite"
            raise ValueError(f"{name} must be {qualifier}")

    red_array = _raster(red, "red") * float(red_scale) + float(red_offset)
    nir_array = _raster(nir, "nir") * float(nir_scale) + float(nir_offset)
    if red_array.shape != nir_array.shape:
        raise ValueError("red and nir rasters must have the same shape")

    total = int(red_array.size)
    valid = np.isfinite(red_array) & np.isfinite(nir_array)
    valid &= (red_array > 0) & (nir_array > 0)
    masked_classes: tuple[int, ...] = ()

    if scl is not None:
        scl_array = _raster(scl, "scl")
        if scl_array.shape != red_array.shape:
            raise ValueError("scl raster must have the same shape as red and nir")
        if not np.all(np.isfinite(scl_array)) or not np.all(scl_array == np.floor(scl_array)):
            raise ValueError("scl raster must contain finite integer classes")
        if np.any((scl_array < 0) | (scl_array > 11)):
            raise ValueError("scl raster classes must be between 0 and 11")
        encountered = tuple(
            class_code
            for class_code in _EXCLUDED_SCL_CLASSES
            if np.any(scl_array == class_code)
        )
        masked_classes = encountered
        if encountered:
            valid &= ~np.isin(scl_array, encountered)

    denominator = nir_array + red_array
    valid &= np.isfinite(denominator) & (denominator > 0)
    valid_count = int(np.count_nonzero(valid))
    ratio = valid_count / total

    if valid_count == 0:
        return Sentinel2NdviStatistics(
            mean_ndvi=None,
            median_ndvi=None,
            min_ndvi=None,
            max_ndvi=None,
            valid_pixel_count=0,
            total_pixel_count=total,
            valid_pixel_ratio=0.0,
            masked_scl_classes=masked_classes,
            quality_flag="no_valid_pixels",
        )

    ndvi = (nir_array[valid] - red_array[valid]) / denominator[valid]
    quality = "valid" if ratio >= float(minimum_valid_ratio) else "insufficient_valid_pixels"
    return Sentinel2NdviStatistics(
        mean_ndvi=float(np.mean(ndvi)),
        median_ndvi=float(np.median(ndvi)),
        min_ndvi=float(np.min(ndvi)),
        max_ndvi=float(np.max(ndvi)),
        valid_pixel_count=valid_count,
        total_pixel_count=total,
        valid_pixel_ratio=float(ratio),
        masked_scl_classes=masked_classes,
        quality_flag=quality,
    )
