"""Composition of the Sentinel-2 data path for a claimed environmental job.

All infrastructure dependencies are injected. Importing this module does not
start a worker, access the network, or read environment variables.
"""
from __future__ import annotations

import math
from datetime import date, datetime, time, timezone
from threading import Event
from typing import Any, Callable, Mapping
from uuid import UUID

from ba_environmental_engine.execution.lease_ingest import persist_leased_sentinel2_rows
from ba_environmental_engine.execution.leased_worker import JobOutcome
from ba_environmental_engine.execution.supabase_locations import SupabaseLocationRepository
from ba_environmental_engine.sources.sentinel2_batch import process_sentinel2_stac_items
from ba_environmental_engine.sources.sentinel2_search import (
    Sentinel2SearchCriteria,
    search_sentinel2_scenes,
)

StacRequest = Callable[..., Any]
PersistRows = Callable[..., dict[str, Any]]


def _uuid(value: Any, field: str) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError(f"{field} must be a valid UUID") from exc


def _date(value: Any, field: str) -> date:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be an ISO calendar date")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field} must be an ISO calendar date") from exc
    if parsed.isoformat() != value:
        raise ValueError(f"{field} must use YYYY-MM-DD")
    return parsed


def make_location_aoi(latitude: float, longitude: float) -> dict[str, Any]:
    """Match the current gateway's approximate location-buffer geometry."""
    if (
        isinstance(latitude, bool) or not isinstance(latitude, (int, float))
        or isinstance(longitude, bool) or not isinstance(longitude, (int, float))
        or not math.isfinite(latitude) or not math.isfinite(longitude)
        or not -90 <= latitude <= 90 or not -180 <= longitude <= 180
    ):
        raise ValueError("valid location coordinates are required")
    half_lat = 0.005
    half_lon = min(0.01, half_lat / max(0.2, math.cos(math.radians(latitude))))
    west, east = max(-180.0, longitude - half_lon), min(180.0, longitude + half_lon)
    south, north = max(-90.0, latitude - half_lat), min(90.0, latitude + half_lat)
    return {
        "type": "Polygon",
        "coordinates": [[
            [west, south], [east, south], [east, north],
            [west, north], [west, south],
        ]],
    }


class LeasedSentinel2JobProcessor:
    """Resolve, discover, raster-process and persist one claimed Sentinel-2 job."""

    def __init__(
        self,
        *,
        locations: SupabaseLocationRepository,
        stac_request: StacRequest,
        ingest_url: str,
        worker_secret: str,
        processing_version: str = "ba-sentinel2-native-v1",
        persist: PersistRows = persist_leased_sentinel2_rows,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        minimum_valid_ratio: float = 0.2,
        max_pixels: int = 4_000_000,
    ) -> None:
        if not callable(stac_request) or not callable(persist):
            raise ValueError("STAC request and persistence adapters must be callable")
        if not isinstance(processing_version, str) or not 1 <= len(processing_version) <= 80:
            raise ValueError("processing_version must contain 1 to 80 characters")
        if not 0 < minimum_valid_ratio <= 1:
            raise ValueError("minimum_valid_ratio must be between 0 and 1")
        if isinstance(max_pixels, bool) or not isinstance(max_pixels, int) or max_pixels < 1:
            raise ValueError("max_pixels must be a positive integer")
        self._locations = locations
        self._stac_request = stac_request
        self._ingest_url = ingest_url
        self._worker_secret = worker_secret
        self._processing_version = processing_version
        self._persist = persist
        self._clock = clock
        self._minimum_valid_ratio = minimum_valid_ratio
        self._max_pixels = max_pixels

    def __call__(self, job: Mapping[str, Any], lease_lost: Event) -> JobOutcome:
        if job.get("job_type") != "sentinel2_scene_ingestion":
            raise ValueError("unsupported environmental job type")
        if job.get("provider_code") != "EARTH_SEARCH" or job.get("dataset_code") != "SENTINEL_2_L2A":
            raise ValueError("unsupported Sentinel-2 provider contract")
        job_id = _uuid(job.get("id"), "job_id")
        lease_token = _uuid(job.get("lease_token"), "lease_token")
        organization_id = _uuid(job.get("organization_id"), "organization_id")
        location_id = _uuid(job.get("location_id"), "location_id")
        parameters = job.get("request_parameters")
        if not isinstance(parameters, Mapping):
            raise ValueError("job request_parameters must be an object")

        start_date = _date(parameters.get("start_date"), "start_date")
        end_date = _date(parameters.get("end_date"), "end_date")
        if start_date > end_date or (end_date - start_date).days + 1 > 90:
            raise ValueError("job date range must be ordered and no longer than 90 days")
        now = self._clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("worker clock must return a timezone-aware datetime")
        now = now.astimezone(timezone.utc)
        if end_date > now.date():
            raise ValueError("job date range cannot include future dates")

        cloud_limit = parameters.get("max_cloud_cover_pct", 30)
        max_scenes = parameters.get("max_scenes", 10)
        if (
            isinstance(cloud_limit, bool) or not isinstance(cloud_limit, (int, float))
            or not math.isfinite(cloud_limit) or not 0 <= cloud_limit <= 100
        ):
            raise ValueError("max_cloud_cover_pct must be between 0 and 100")
        if isinstance(max_scenes, bool) or not isinstance(max_scenes, int) or not 1 <= max_scenes <= 10:
            raise ValueError("max_scenes must be between 1 and 10")
        if lease_lost.is_set():
            raise InterruptedError("Sentinel-2 job cancelled after lease loss")

        location = self._locations.get_for_job(
            location_id=location_id,
            organization_id=organization_id,
        )
        aoi = make_location_aoi(location["latitude"], location["longitude"])
        criteria = Sentinel2SearchCriteria(
            aoi_geojson=aoi,
            start=datetime.combine(start_date, time.min, tzinfo=timezone.utc),
            end=datetime.combine(end_date, time.max, tzinfo=timezone.utc),
            max_cloud_cover_pct=float(cloud_limit),
            max_items=max_scenes,
            page_size=min(max_scenes, 10),
        )
        search = search_sentinel2_scenes(criteria, request=self._stac_request)
        if lease_lost.is_set():
            raise InterruptedError("Sentinel-2 job cancelled after STAC discovery")
        if not search.items:
            return JobOutcome(
                status="failed",
                result_summary={
                    "pages_read": search.pages_read,
                    "items_seen": search.items_seen,
                    "scenes_selected": 0,
                    "rejected_items": search.rejected_items,
                },
                error_code="no_usable_sentinel2_scenes",
            )

        batch = process_sentinel2_stac_items(
            search.items,
            aoi,
            organization_id=organization_id,
            location_id=location_id,
            retrieved_at=now,
            processing_version=self._processing_version,
            minimum_valid_ratio=self._minimum_valid_ratio,
            max_pixels=self._max_pixels,
            max_scenes=max_scenes,
            stop_event=lease_lost,
        )
        if lease_lost.is_set():
            raise InterruptedError("Sentinel-2 job cancelled before persistence")

        valid_rows: list[dict[str, Any]] = []
        quality_rejected = 0
        for processed in batch.succeeded:
            rows = tuple(processed.observation_rows)
            if len(rows) != 2 or any(row.get("quality_flag") != "valid" for row in rows):
                quality_rejected += 1
                continue
            valid_rows.extend(rows)

        persistence = None
        if valid_rows:
            persistence = self._persist(
                job_id=job_id,
                lease_token=lease_token,
                organization_id=organization_id,
                location_id=location_id,
                rows=valid_rows,
                ingest_url=self._ingest_url,
                worker_secret=self._worker_secret,
            )

        observations = (
            persistence.get("observations_upserted", len(valid_rows))
            if isinstance(persistence, Mapping) else 0
        )
        if isinstance(observations, bool) or not isinstance(observations, int) or observations < 0:
            raise RuntimeError("lease persistence returned an invalid observation count")
        failed_count = batch.failure_count + quality_rejected
        succeeded_count = batch.success_count - quality_rejected
        status = "failed" if succeeded_count == 0 else (
            "partial_failed" if failed_count else "succeeded"
        )
        return JobOutcome(
            status=status,
            result_summary={
                "pages_read": search.pages_read,
                "items_seen": search.items_seen,
                "scenes_selected": len(search.items),
                "rejected_items": search.rejected_items,
                "quality_rejected_scenes": quality_rejected,
                "persistence": dict(persistence) if isinstance(persistence, Mapping) else None,
            },
            scenes_processed=succeeded_count,
            scenes_failed=failed_count,
            scenes_duplicated=len(batch.duplicate_scene_ids),
            observations_submitted=observations,
            error_code="sentinel2_scene_processing_partial_failure" if failed_count else None,
        )
