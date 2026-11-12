"""Build auditable database payloads from native Sentinel-2 raster statistics.

This is the pure boundary between raster processing and persistence. It does
not perform network access or write to Supabase.
"""
from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite
from typing import Any
from uuid import UUID

from ba_environmental_engine.sources.sentinel2_raster import Sentinel2NdviStatistics


def _uuid(value: str | UUID, field: str) -> str:
    try:
        return str(value if isinstance(value, UUID) else UUID(str(value)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError(f"{field} must be a valid UUID") from exc


def _utc_timestamp(value: datetime, field: str) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field} must be timezone-aware")
    return value.astimezone(timezone.utc)


def _finite_number(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a finite number")
    result = float(value)
    if not isfinite(result):
        raise ValueError(f"{field} must be a finite number")
    return result


def build_sentinel2_observation_rows(
    *,
    statistics: Sentinel2NdviStatistics,
    organization_id: str | UUID,
    location_id: str | UUID,
    scene_id: str,
    observed_at: datetime,
    retrieved_at: datetime,
    source_url: str,
    cloud_cover_pct: float,
    spatial_resolution_m: float,
    processing_version: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Create mean/median NDVI rows matching environmental_observations.

    The database's unique key (organization, location, provider, dataset,
    variable, observed_at) makes repeated ingestion idempotent at the row level.
    A scene can legitimately produce two rows because the variable differs.
    """
    if not isinstance(statistics, Sentinel2NdviStatistics):
        raise ValueError("statistics must be Sentinel2NdviStatistics")
    if statistics.quality_flag == "no_valid_pixels" or statistics.valid_pixel_count == 0:
        raise ValueError("Sentinel-2 scene has no valid pixels")
    if statistics.quality_flag not in {"valid", "insufficient_valid_pixels"}:
        raise ValueError("statistics quality_flag is unsupported")
    if (
        isinstance(statistics.total_pixel_count, bool)
        or not isinstance(statistics.total_pixel_count, int)
        or statistics.total_pixel_count <= 0
        or isinstance(statistics.valid_pixel_count, bool)
        or not isinstance(statistics.valid_pixel_count, int)
        or not 0 < statistics.valid_pixel_count <= statistics.total_pixel_count
    ):
        raise ValueError("statistics pixel counts are inconsistent")
    expected_ratio = statistics.valid_pixel_count / statistics.total_pixel_count
    if not isfinite(statistics.valid_pixel_ratio) or abs(statistics.valid_pixel_ratio - expected_ratio) > 1e-9:
        raise ValueError("statistics valid_pixel_ratio is inconsistent with pixel counts")

    org_id = _uuid(organization_id, "organization_id")
    loc_id = _uuid(location_id, "location_id")
    observed = _utc_timestamp(observed_at, "observed_at")
    retrieved = _utc_timestamp(retrieved_at, "retrieved_at")
    if retrieved < observed:
        raise ValueError("retrieved_at cannot precede observed_at")

    if not isinstance(scene_id, str) or not scene_id.strip():
        raise ValueError("scene_id is required")
    if not isinstance(processing_version, str) or not processing_version.strip():
        raise ValueError("processing_version is required")
    if not isinstance(source_url, str) or not source_url.startswith("https://"):
        raise ValueError("source_url must be HTTPS")
    cloud_cover = _finite_number(cloud_cover_pct, "cloud_cover_pct")
    if not 0 <= cloud_cover <= 100:
        raise ValueError("cloud_cover_pct must be between 0 and 100")
    resolution = _finite_number(spatial_resolution_m, "spatial_resolution_m")
    if resolution <= 0:
        raise ValueError("spatial_resolution_m must be greater than zero")

    mask_classes = sorted(set(statistics.masked_scl_classes))
    if any(isinstance(code, bool) or not isinstance(code, int) or not 0 <= code <= 11 for code in mask_classes):
        raise ValueError("masked_scl_classes must contain SCL classes from 0 to 11")

    common = {
        "organization_id": org_id,
        "location_id": loc_id,
        "data_family": "satellite",
        "provider_code": "EARTH_SEARCH",
        "dataset_code": "SENTINEL_2_L2A",
        "unit_code": "1",
        "observed_at": observed.isoformat(),
        "retrieved_at": retrieved.isoformat(),
        "spatial_resolution_m": resolution,
        "quality_flag": statistics.quality_flag,
        "source_url": source_url,
        "metadata": {
            "scene_id": scene_id.strip(),
            "cloud_cover_pct": cloud_cover,
            "valid_pixel_count": statistics.valid_pixel_count,
            "total_pixel_count": statistics.total_pixel_count,
            "valid_pixel_ratio": statistics.valid_pixel_ratio,
            "mask_classes": mask_classes,
            "processing_version": processing_version.strip(),
            "ndvi_min": statistics.min_ndvi,
            "ndvi_max": statistics.max_ndvi,
        },
    }
    return (
        {**common, "variable_code": "ndvi_mean", "value": statistics.mean_ndvi},
        {**common, "variable_code": "ndvi_median", "value": statistics.median_ndvi},
    )
