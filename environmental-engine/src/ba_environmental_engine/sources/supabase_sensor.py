"""Read-only Supabase repository for sensor measurements.

The client is injected by the trusted API boundary. No credentials or SDK
initialization live in the environmental engine package.
"""
from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from ba_environmental_engine.sources.sensor import (
    SensorMeasurementEnvelope,
    normalize_iot_measurement_row,
)


class SupabaseSensorMeasurementRepository:
    """Load tenant-scoped sensor rows for an environment/profile/date scope."""

    _PROFILE_SELECT = (
        "id,organization_id,environment_id,profile_code,profile_version,"
        "context_type,label,timezone,origin,valid_from,valid_to,status,"
        "environment:environments!environment_context_profiles_environment_fk(location_id),"
        "sensors:environment_context_profile_sensors!environment_context_profile_sensors_profile_fk(sensor_id)"
    )
    _MEASUREMENT_SELECT = (
        "id,organization_id,variable_code,raw_value,raw_unit_code,"
        "normalized_value,normalized_unit_code,measured_at,method,instrument,"
        "quality_state,exclusion_reason,environment_id,iot_device_id,metadata,"
        "device:iot_devices!measurements_org_iot_device_fk("
        "id,organization_id,environment_id,device_code,device_type),"
        "environment:environments!measurements_org_environment_fk("
        "id,organization_id,location_id),"
        "variable:variables!measurements_variable_code_fkey(canonical_unit_code)"
    )

    def __init__(self, client: Any):
        self._client = client

    @staticmethod
    def _data(response: Any) -> Any:
        if not hasattr(response, "data"):
            raise RuntimeError("Supabase response does not expose data")
        return response.data

    @staticmethod
    def _one(records: Any, label: str) -> Mapping[str, Any]:
        rows = records or []
        if not rows:
            raise LookupError(f"no sensor environment profile covers the requested {label} scope")
        if len(rows) != 1:
            raise ValueError(f"multiple sensor environment profiles cover the requested {label} scope")
        return rows[0]

    @staticmethod
    def _relation(row: Mapping[str, Any], name: str) -> Mapping[str, Any]:
        value = row.get(name)
        if isinstance(value, list):
            if len(value) != 1:
                raise ValueError(f"joined {name} relation must contain exactly one record")
            value = value[0]
        if not isinstance(value, Mapping):
            raise ValueError(f"joined {name} relation is required")
        return value

    @staticmethod
    def _scope_timestamps(
        from_date: date, to_date: date, timezone_name: str
    ) -> tuple[str, str]:
        if to_date < from_date:
            raise ValueError("scope to_date must be on or after from_date")
        try:
            zone = ZoneInfo(timezone_name)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("profile timezone must be a valid IANA timezone") from exc
        start = datetime.combine(from_date, time.min, tzinfo=zone)
        end = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=zone)
        return (
            start.astimezone(timezone.utc).isoformat(),
            end.astimezone(timezone.utc).isoformat(),
        )

    def list_for_scope(
        self,
        *,
        organization_id: str,
        environment_id: str,
        from_date: date,
        to_date: date,
    ) -> tuple[SensorMeasurementEnvelope, ...]:
        """Return sensor readings for a complete profile-covered calendar window.

        Retired profiles remain eligible for historical windows when their
        validity dates cover the entire requested interval.
        """
        if to_date < from_date:
            raise ValueError("scope to_date must be on or after from_date")

        profile_response = (
            self._client.table("environment_context_profiles")
            .select(self._PROFILE_SELECT)
            .eq("organization_id", organization_id)
            .eq("environment_id", environment_id)
            .eq("origin", "sensor")
            .in_("status", ["active", "retired"])
            .lte("valid_from", from_date.isoformat())
            .or_(f"valid_to.is.null,valid_to.gte.{to_date.isoformat()}")
            .order("valid_from", desc=True)
            .execute()
        )
        profile = self._one(self._data(profile_response), "date")
        if profile.get("origin") != "sensor":
            raise ValueError("resolved environment profile is not sensor-origin")
        if profile.get("status") not in {"active", "retired"}:
            raise ValueError("only activated sensor profiles can be used")
        if profile["valid_from"] > from_date.isoformat() or (
            profile.get("valid_to") is not None
            and profile["valid_to"] < to_date.isoformat()
        ):
            raise LookupError("sensor profile does not cover the complete requested date window")

        environment = self._relation(profile, "environment")
        if not environment.get("location_id"):
            raise ValueError("sensor profile environment must have a physical location")
        sensor_rows = profile.get("sensors") or []
        sensor_ids = [str(item["sensor_id"]) for item in sensor_rows if item.get("sensor_id")]
        if not sensor_ids:
            raise LookupError("sensor profile has no registered sensor bindings")

        start_at, end_at = self._scope_timestamps(
            from_date, to_date, profile["timezone"]
        )
        measurement_response = (
            self._client.table("measurements")
            .select(self._MEASUREMENT_SELECT)
            .eq("organization_id", organization_id)
            .eq("environment_id", environment_id)
            .in_("iot_device_id", sensor_ids)
            .eq("metadata->>source", "iot")
            .gte("measured_at", start_at)
            .lt("measured_at", end_at)
            .order("measured_at")
            .execute()
        )

        envelopes: list[SensorMeasurementEnvelope] = []
        for record in self._data(measurement_response) or []:
            device = self._relation(record, "device")
            joined_environment = self._relation(record, "environment")
            variable = self._relation(record, "variable")
            device_id = str(device.get("id"))
            joined = {
                **record,
                "device_organization_id": device.get("organization_id"),
                "device_environment_id": device.get("environment_id"),
                "environment_organization_id": joined_environment.get("organization_id"),
                "location_id": joined_environment.get("location_id"),
                "device_code": device.get("device_code"),
                "device_type": device.get("device_type"),
                "canonical_unit_code": variable.get("canonical_unit_code"),
                "profile_origin": profile.get("origin"),
                "profile_status": profile.get("status"),
                "profile_valid_from": profile.get("valid_from"),
                "profile_valid_to": profile.get("valid_to"),
                "profile_timezone": profile.get("timezone"),
                "profile_sensor_bound": device_id in sensor_ids,
            }
            envelopes.append(normalize_iot_measurement_row(joined))
        return tuple(envelopes)
