"""Resilient, bounded orchestration for Sentinel-2 scene batches."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Sequence
from threading import Event
from uuid import UUID

from ba_environmental_engine.sources.sentinel2_pipeline import (
    Sentinel2SceneProcessingResult,
    process_sentinel2_stac_item,
)


@dataclass(frozen=True, slots=True)
class Sentinel2SceneFailure:
    scene_id: str
    error_type: str
    message: str


@dataclass(frozen=True, slots=True)
class Sentinel2BatchProcessingResult:
    succeeded: tuple[Any, ...]
    failed: tuple[Sentinel2SceneFailure, ...]
    duplicate_scene_ids: tuple[str, ...]
    items_received: int

    @property
    def success_count(self) -> int:
        return len(self.succeeded)

    @property
    def failure_count(self) -> int:
        return len(self.failed)


def process_sentinel2_stac_items(
    items: Sequence[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    *,
    organization_id: str | UUID,
    location_id: str | UUID,
    retrieved_at: datetime,
    processing_version: str,
    opener: Callable[[str], Any] | None = None,
    minimum_valid_ratio: float = 0.2,
    max_pixels: int = 4_000_000,
    max_scenes: int = 100,
    stop_event: Event | None = None,
) -> Sentinel2BatchProcessingResult:
    """Process each unique scene independently; one failure never aborts peers.

    The function is deliberately persistence-free. The caller remains
    responsible for tenant/location authorization and durable writes.
    """
    if not isinstance(items, Sequence) or isinstance(items, (str, bytes)):
        raise ValueError("items must be a finite sequence of STAC Feature objects")
    if isinstance(max_scenes, bool) or not isinstance(max_scenes, int) or not 1 <= max_scenes <= 500:
        raise ValueError("max_scenes must be between 1 and 500")
    if len(items) > max_scenes:
        raise ValueError(f"batch exceeds max_scenes limit ({max_scenes})")

    succeeded: list[Any] = []
    failed: list[Sentinel2SceneFailure] = []
    duplicates: list[str] = []
    seen: set[str] = set()

    for index, item in enumerate(items):
        if stop_event is not None and stop_event.is_set():
            raise InterruptedError("Sentinel-2 batch cancelled after lease loss")
        candidate_id = item.get("id") if isinstance(item, dict) else None
        scene_id = candidate_id.strip() if isinstance(candidate_id, str) and candidate_id.strip() else f"<item:{index}>"
        if scene_id in seen:
            duplicates.append(scene_id)
            continue
        if not scene_id.startswith("<item:"):
            seen.add(scene_id)

        try:
            result: Sentinel2SceneProcessingResult = process_sentinel2_stac_item(
                item,
                aoi_geojson,
                organization_id=organization_id,
                location_id=location_id,
                retrieved_at=retrieved_at,
                processing_version=processing_version,
                opener=opener,
                minimum_valid_ratio=minimum_valid_ratio,
                max_pixels=max_pixels,
            )
            succeeded.append(result)
        except Exception as exc:
            # Preserve scene-level diagnostics without leaking tracebacks or
            # credentials into the batch summary.
            failed.append(
                Sentinel2SceneFailure(
                    scene_id=scene_id,
                    error_type=type(exc).__name__,
                    message=str(exc)[:500],
                )
            )

    return Sentinel2BatchProcessingResult(
        succeeded=tuple(succeeded),
        failed=tuple(failed),
        duplicate_scene_ids=tuple(duplicates),
        items_received=len(items),
    )
