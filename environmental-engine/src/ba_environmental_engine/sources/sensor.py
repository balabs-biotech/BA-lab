"""Strict adapter from the existing Supabase IoT measurement row to the sensor contract.

This module performs no I/O. The repository layer is responsible for tenant-scoped
joins and selecting an active sensor profile; this adapter verifies that evidence.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ba_environmental_engine.contexts.measurement import (
    EnvironmentalMeasurement,
    MeasurementOrigin,
)


@dataclass(frozen=True, slots=True)
class SensorMeasurementEnvelope:
    """Measurement plus quality and provenance fields not yet in the Pydantic contract."""

    measurement: EnvironmentalMeasurement
    quality_state: str
    exclusion_reason: str | None
    method: str | None
    instrument: str | None
    device_code: str
    device_type: str
    metadata: dict[str, Any]


def _uuid(row: dict[str, Any], key: str) -> UUID:
    value = row.get(key)
    if value is None:
        raise ValueError(f"{key} is required")
    try:
        return value if isinstance(value, UUID) else UUID(str(value))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError(f"{key} must be a valid UUID") from exc


def _timestamp(value: Any) -> datetime:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("measured_at must be an ISO-8601 timestamp") from exc
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("measured_at must include a valid timezone")
    return value.astimezone(timezone.utc)


def _profile_date(value: Any, field: str) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        raise ValueError(f"{field} must be a calendar date, not a timestamp")
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError(f"{field} must be an ISO calendar date") from exc
    raise ValueError(f"{field} must be a calendar date")


def normalize_iot_measurement_row(row: dict[str, Any]) -> SensorMeasurementEnvelope:
    """Validate and normalize one joined measurement/device/environment/profile row.

    Profile validity columns are SQL DATE values and are evaluated in profile timezone.
    """
    if not isinstance(row, dict):
        raise ValueError("measurement row must be an object")

    organization_id = _uuid(row, "organization_id")
    if _uuid(row, "device_organization_id") != organization_id:
        raise ValueError("device tenant does not match measurement tenant")
    if _uuid(row, "environment_organization_id") != organization_id:
        raise ValueError("environment tenant does not match measurement tenant")

    environment_id = _uuid(row, "environment_id")
    if _uuid(row, "device_environment_id") != environment_id:
        raise ValueError("device environment does not match measurement environment")
    location_id = _uuid(row, "location_id")
    sensor_id = _uuid(row, "iot_device_id")

    metadata = row.get("metadata") or {}
    if not isinstance(metadata, dict) or metadata.get("source") != "iot":
        raise ValueError("measurement is not identified as an IoT source row")

    if row.get("profile_origin") != "sensor" or row.get("profile_status") not in {"active", "retired"}:
        raise ValueError("measurement requires an active sensor-origin environment profile")
    if row.get("profile_sensor_bound") is not True:
        raise ValueError("device is not bound to the selected environment profile")

    observed_at = _timestamp(row.get("measured_at"))
    profile_timezone = row.get("profile_timezone")
    if not isinstance(profile_timezone, str) or not profile_timezone:
        raise ValueError("profile_timezone is required")
    try:
        local_observed_date = observed_at.astimezone(ZoneInfo(profile_timezone)).date()
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError("profile_timezone must be a valid IANA timezone") from exc

    valid_from = _profile_date(row.get("profile_valid_from"), "profile_valid_from")
    valid_to = _profile_date(row.get("profile_valid_to"), "profile_valid_to")
    if valid_from is not None and local_observed_date < valid_from:
        raise ValueError("measurement falls before the sensor profile validity window")
    if valid_to is not None and local_observed_date > valid_to:
        raise ValueError("measurement falls after the sensor profile validity window")

    normalized_value = row.get("normalized_value")
    normalized_unit = row.get("normalized_unit_code")
    if normalized_value is not None:
        if normalized_unit is None:
            raise ValueError("normalized_unit_code is required with normalized_value")
        value, unit = normalized_value, normalized_unit
    else:
        value, unit = row.get("raw_value"), row.get("raw_unit_code")
        if unit is None or unit != row.get("canonical_unit_code"):
            raise ValueError(
                "raw measurement unit must match the variable canonical unit when no normalized value exists"
            )

    quality_state = row.get("quality_state")
    if quality_state not in {"raw", "controlled", "validated", "excluded"}:
        raise ValueError("unsupported measurement quality_state")
    exclusion_reason = row.get("exclusion_reason")
    if quality_state == "excluded" and not exclusion_reason:
        raise ValueError("excluded measurements require exclusion_reason")

    device_code = row.get("device_code")
    device_type = row.get("device_type")
    if not isinstance(device_code, str) or not device_code.strip():
        raise ValueError("device_code is required")
    if not isinstance(device_type, str) or not device_type.strip():
        raise ValueError("device_type is required")

    observation_id = _uuid(row, "id")
    measurement = EnvironmentalMeasurement.model_validate({
        "observation_id": observation_id,
        "organization_id": organization_id,
        "location_id": location_id,
        "context_id": environment_id,
        "origin": MeasurementOrigin.SENSOR,
        "sensor_id": sensor_id,
        "variable_code": row.get("variable_code"),
        "value": value,
        "unit_code": unit,
        "observed_at": observed_at,
        "source_observation_ids": [observation_id],
    })

    return SensorMeasurementEnvelope(
        measurement=measurement,
        quality_state=quality_state,
        exclusion_reason=exclusion_reason,
        method=row.get("method"),
        instrument=row.get("instrument"),
        device_code=device_code,
        device_type=device_type,
        metadata=dict(metadata),
    )
