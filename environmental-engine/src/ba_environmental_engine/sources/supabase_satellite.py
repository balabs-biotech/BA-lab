"""Read-only, tenant-scoped repository for persisted Sentinel-2 observations.

The Supabase client is injected by a trusted API boundary. This module contains
no credentials, client construction, imagery download, or raster processing.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from uuid import UUID

from ba_environmental_engine.sources.sentinel2 import normalize_sentinel2_observation


class SupabaseSatelliteObservationRepository:
    """Load and normalize Sentinel-2 NDVI aggregates for one tenant/location."""

    _SELECT = (
        "id,organization_id,location_id,data_family,provider_code,dataset_code,"
        "variable_code,value,unit_code,observed_at,retrieved_at,"
        "spatial_resolution_m,quality_flag,source_url,metadata"
    )

    def __init__(self, client: Any):
        self._client = client

    @staticmethod
    def _data(response: Any) -> Any:
        if not hasattr(response, "data"):
            raise RuntimeError("Supabase response does not expose data")
        return response.data

    @staticmethod
    def _uuid(value: str | UUID, field: str) -> UUID:
        try:
            return value if isinstance(value, UUID) else UUID(str(value))
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValueError(f"{field} must be a valid UUID") from exc

    @staticmethod
    def _utc_bounds(from_date: date, to_date: date) -> tuple[str, str]:
        if to_date < from_date:
            raise ValueError("scope to_date must be on or after from_date")
        start = datetime.combine(from_date, time.min, tzinfo=timezone.utc)
        end = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
        return start.isoformat(), end.isoformat()

    def list_ndvi_for_scope(
        self,
        *,
        organization_id: str | UUID,
        location_id: str | UUID,
        from_date: date,
        to_date: date,
    ) -> tuple[Any, ...]:
        """Return UTC-date-window NDVI observations, preserving every source row.

        The database query is tenant and location scoped. Returned rows are
        independently checked against the requested scope before normalization;
        malformed persisted data raises rather than being silently discarded.
        """
        org_id = self._uuid(organization_id, "organization_id")
        loc_id = self._uuid(location_id, "location_id")
        start_at, end_at = self._utc_bounds(from_date, to_date)

        response = (
            self._client.table("environmental_observations")
            .select(self._SELECT)
            .eq("organization_id", str(org_id))
            .eq("location_id", str(loc_id))
            .eq("data_family", "satellite")
            .eq("provider_code", "EARTH_SEARCH")
            .eq("dataset_code", "SENTINEL_2_L2A")
            .in_("variable_code", ["ndvi_mean", "ndvi_median"])
            .gte("observed_at", start_at)
            .lt("observed_at", end_at)
            .order("observed_at")
            .execute()
        )

        rows = self._data(response) or []
        observations = []
        for row in rows:
            if str(row.get("organization_id")) != str(org_id):
                raise ValueError("persisted satellite observation organization does not match scope")
            if str(row.get("location_id")) != str(loc_id):
                raise ValueError("persisted satellite observation location does not match scope")
            observation = normalize_sentinel2_observation(row)
            if not start_at <= observation.observed_at.isoformat() < end_at:
                raise ValueError("persisted satellite observation timestamp is outside requested date scope")
            observations.append(observation)

        return tuple(observations)
