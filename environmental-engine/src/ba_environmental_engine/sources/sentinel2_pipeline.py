"""Orchestrate one Sentinel-2 STAC item through raster analysis to DB payloads.

This module deliberately stops before persistence. A trusted API/worker must
authorize the tenant and location, then decide when and how to write the rows.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable
from uuid import UUID

from ba_environmental_engine.sources.sentinel2_ingestion import (
    build_sentinel2_observation_rows,
)
from ba_environmental_engine.sources.sentinel2_raster_reader import (
    Sentinel2RasterReadResult,
    read_sentinel2_ndvi_window,
)
from ba_environmental_engine.sources.sentinel2_stac import (
    Sentinel2StacScene,
    parse_sentinel2_stac_item,
)


@dataclass(frozen=True, slots=True)
class Sentinel2SceneProcessingResult:
    """Auditable output of processing one STAC scene for one AOI."""

    scene: Sentinel2StacScene
    raster: Sentinel2RasterReadResult
    observation_rows: tuple[dict[str, Any], dict[str, Any]]


def process_sentinel2_stac_item(
    item: dict[str, Any],
    aoi_geojson: dict[str, Any],
    *,
    organization_id: str | UUID,
    location_id: str | UUID,
    retrieved_at: datetime,
    processing_version: str,
    opener: Callable[[str], Any] | None = None,
    minimum_valid_ratio: float = 0.2,
    max_pixels: int = 4_000_000,
) -> Sentinel2SceneProcessingResult:
    """Parse, read and normalize one STAC scene without writing to Supabase."""
    scene = parse_sentinel2_stac_item(item)
    raster = read_sentinel2_ndvi_window(
        scene,
        aoi_geojson,
        opener=opener,
        minimum_valid_ratio=minimum_valid_ratio,
        max_pixels=max_pixels,
    )
    rows = build_sentinel2_observation_rows(
        statistics=raster.statistics,
        organization_id=organization_id,
        location_id=location_id,
        scene_id=scene.scene_id,
        observed_at=scene.observed_at,
        retrieved_at=retrieved_at,
        source_url=scene.item_url,
        cloud_cover_pct=scene.cloud_cover_pct,
        spatial_resolution_m=raster.spatial_resolution_m,
        processing_version=processing_version,
    )
    return Sentinel2SceneProcessingResult(
        scene=scene,
        raster=raster,
        observation_rows=rows,
    )
