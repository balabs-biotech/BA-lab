"""Strict adapter for persisted Sentinel-2 L2A NDVI aggregate observations.

The adapter accepts already-computed, server-persisted statistics. It does not
download imagery, calculate NDVI, apply cloud masks, or decide biological meaning.
"""
from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation


_ALLOWED_NDVI_VARIABLES = {"ndvi_mean", "ndvi_median"}


def _uuid(row: dict[str, Any], field: str) -> UUID:
    value = row.get(field)
    try:
        return value if isinstance(value, UUID) else UUID(str(value))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError(f"{field} must be a valid UUID") from exc


def _timestamp(row: dict[str, Any], field: str) -> datetime:
    value = row.get(field)
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"{field} must be an ISO-8601 timestamp") from exc
    if (
        not isinstance(value, datetime)
        or value.tzinfo is None
        or value.utcoffset() is None
    ):
        raise ValueError(f"{field} must include a valid timezone")
    return value.astimezone(timezone.utc)


def _number(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a finite number")
    result = float(value)
    if not isfinite(result):
        raise ValueError(f"{field} must be a finite number")
    return result


def _metadata(row: dict[str, Any]) -> dict[str, Any]:
    value = row.get("metadata")
    if not isinstance(value, dict):
        raise ValueError("metadata must be an object")

    scene_id = value.get("scene_id")
    if not isinstance(scene_id, str) or not scene_id.strip():
        raise ValueError("metadata.scene_id is required")

    cloud_cover = _number(value.get("cloud_cover_pct"), "metadata.cloud_cover_pct")
    if not 0 <= cloud_cover <= 100:
        raise ValueError("metadata.cloud_cover_pct must be between 0 and 100")

    pixel_count = value.get("valid_pixel_count")
    if (
        isinstance(pixel_count, bool)
        or not isinstance(pixel_count, int)
        or pixel_count < 0
    ):
        raise ValueError("metadata.valid_pixel_count must be a nonnegative integer")

    pixel_ratio = _number(value.get("valid_pixel_ratio"), "metadata.valid_pixel_ratio")
    if not 0 <= pixel_ratio <= 1:
        raise ValueError("metadata.valid_pixel_ratio must be between 0 and 1")

    processing_version = value.get("processing_version")
    if not isinstance(processing_version, str) or not processing_version.strip():
        raise ValueError("metadata.processing_version is required")

    mask_classes = value.get("mask_classes")
    if (
        not isinstance(mask_classes, list)
        or any(
            isinstance(item, bool)
            or not isinstance(item, int)
            or not 0 <= item <= 11
            for item in mask_classes
        )
    ):
        raise ValueError("metadata.mask_classes must contain Sentinel-2 SCL class integers")

    return dict(value)


def normalize_sentinel2_observation(
    row: dict[str, Any],
) -> NormalizedEnvironmentalObservation:
    """Normalize one persisted Sentinel-2 NDVI aggregate without losing provenance."""
    if not isinstance(row, dict):
        raise ValueError("satellite observation row must be an object")
    if row.get("data_family") != "satellite":
        raise ValueError("Sentinel-2 observation data_family must be satellite")
    if row.get("provider_code") != "EARTH_SEARCH":
        raise ValueError("Sentinel-2 provider_code must be EARTH_SEARCH")
    if row.get("dataset_code") != "SENTINEL_2_L2A":
        raise ValueError("Sentinel-2 dataset_code must be SENTINEL_2_L2A")

    variable_code = row.get("variable_code")
    if variable_code not in _ALLOWED_NDVI_VARIABLES:
        raise ValueError("Sentinel-2 variable_code must identify an NDVI aggregate")

    value = _number(row.get("value"), "NDVI value")
    if not -1 <= value <= 1:
        raise ValueError("NDVI value must be between -1 and 1")
    if row.get("unit_code") != "1":
        raise ValueError("NDVI unit_code must be dimensionless ('1')")

    resolution = _number(row.get("spatial_resolution_m"), "spatial_resolution_m")
    if resolution <= 0:
        raise ValueError("spatial_resolution_m must be greater than zero")

    source_url = row.get("source_url")
    if not isinstance(source_url, str):
        raise ValueError("source_url must be an HTTPS URL")
    parsed_url = urlsplit(source_url)
    if parsed_url.scheme != "https" or not parsed_url.netloc:
        raise ValueError("source_url must be an HTTPS URL")

    observed_at = _timestamp(row, "observed_at")
    retrieved_at = _timestamp(row, "retrieved_at")
    quality_flag = row.get("quality_flag")
    if quality_flag is not None and (
        not isinstance(quality_flag, str) or not quality_flag.strip()
    ):
        raise ValueError("quality_flag must be a non-empty string when provided")

    metadata = _metadata(row)

    return NormalizedEnvironmentalObservation(
        source_observation_id=_uuid(row, "id"),
        organization_id=_uuid(row, "organization_id"),
        location_id=_uuid(row, "location_id"),
        data_family="satellite",
        provider_code="EARTH_SEARCH",
        dataset_code="SENTINEL_2_L2A",
        source_parameter=variable_code,
        variable_code=variable_code,
        value=value,
        unit="1",
        source_value=value,
        source_unit="1",
        observed_at=observed_at,
        observed_date=observed_at.date(),
        retrieved_at=retrieved_at,
        spatial_resolution_m=resolution,
        quality_flag=quality_flag,
        source_url=source_url,
        source_time_standard="UTC",
        source_metadata=metadata,
    )
