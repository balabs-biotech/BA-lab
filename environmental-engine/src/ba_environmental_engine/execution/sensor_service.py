"""Application orchestration for the independent IoT Sensor Engine."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ba_environmental_engine.sources.sensor import SensorMeasurementEnvelope
from ba_environmental_engine.sources.sensor_analysis import (
    SensorAnalysis,
    summarize_sensor_measurements,
)


class SensorMeasurementRepository(Protocol):
    """Minimal read-only source contract consumed by the sensor use case."""

    def list_for_scope(
        self,
        *,
        organization_id: str,
        environment_id: str,
        from_date: date,
        to_date: date,
    ) -> tuple[SensorMeasurementEnvelope, ...]: ...


def run_sensor_analysis(
    *,
    repository: SensorMeasurementRepository,
    organization_id: str,
    environment_id: str,
    from_date: date,
    to_date: date,
    profile_timezone: str,
    expected_interval_seconds: int | None = None,
) -> SensorAnalysis:
    """Load and summarize one tenant/environment sensor scope.

    This use case intentionally has no NASA POWER dependency and does not
    invoke FAO-56. The repository owns tenant-scoped reads and profile coverage;
    the analysis function owns quality-aware sensor statistics.
    """
    if to_date < from_date:
        raise ValueError("to_date must be on or after from_date")
    try:
        zone = ZoneInfo(profile_timezone)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError("profile_timezone must be a valid IANA timezone") from exc

    envelopes = repository.list_for_scope(
        organization_id=organization_id,
        environment_id=environment_id,
        from_date=from_date,
        to_date=to_date,
    )
    start_at = datetime.combine(from_date, time.min, tzinfo=zone).astimezone(timezone.utc)
    end_at = datetime.combine(
        to_date + timedelta(days=1), time.min, tzinfo=zone
    ).astimezone(timezone.utc)

    for envelope in envelopes:
        measurement = envelope.measurement
        if str(measurement.organization_id) != organization_id:
            raise ValueError("repository returned a measurement from another tenant")
        if str(measurement.context_id) != environment_id:
            raise ValueError("repository returned a measurement from another environment")

    return summarize_sensor_measurements(
        envelopes,
        from_at=start_at,
        to_at_exclusive=end_at,
        expected_interval_seconds=expected_interval_seconds,
    )
