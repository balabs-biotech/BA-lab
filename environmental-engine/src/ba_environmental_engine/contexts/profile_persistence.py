"""Read-only adapters for versioned environmental and domain profiles.

The Supabase client is injected by the application boundary. This module owns
no credentials, authentication, or writes to profile registries.
"""

from collections.abc import Mapping
from typing import Any

from ba_environmental_engine.contexts.biological import BiologicalDomain
from ba_environmental_engine.contexts.environment import (
    EnvironmentContext,
    EnvironmentType,
    ObservationOrigin,
)
from ba_environmental_engine.interpretation.models import (
    DomainProfile,
    InterpretationRule,
)


def environment_context_from_record(
    record: Mapping[str, Any],
) -> EnvironmentContext:
    """Build an engine context from its environment and sensor relations."""
    environment = record.get("environment")
    if not isinstance(environment, Mapping) or not environment.get("location_id"):
        raise ValueError(
            "joined environment must provide a physical location for analysis"
        )

    sensor_records = record.get("sensors", [])
    if not isinstance(sensor_records, (list, tuple)):
        raise ValueError("joined profile sensors must be an array")

    sensor_ids: list[str] = []
    for sensor in sensor_records:
        if not isinstance(sensor, Mapping) or not sensor.get("sensor_id"):
            raise ValueError("each sensor binding must provide a sensor_id")
        sensor_ids.append(sensor["sensor_id"])

    if record.get("status") not in {"active", "retired"}:
        raise ValueError("only activated environment profile versions can be resolved")

    return EnvironmentContext(
        context_id=record["id"],
        organization_id=record["organization_id"],
        location_id=environment["location_id"],
        context_type=EnvironmentType(record["context_type"]),
        label=record["label"],
        timezone=record["timezone"],
        origin=ObservationOrigin(record["origin"]),
        sensor_ids=sensor_ids,
        profile_code=record["profile_code"],
        profile_version=record["profile_version"],
    )


def domain_profile_from_record(record: Mapping[str, Any]) -> DomainProfile:
    """Build a typed interpretation profile from immutable persisted rules."""
    if record.get("status") not in {"active", "retired"}:
        raise ValueError("only activated domain profile versions can be resolved")

    rules = record.get("rules", [])
    if not isinstance(rules, (list, tuple)):
        raise ValueError("persisted domain profile rules must be an array")

    typed_rules = tuple(InterpretationRule.model_validate(rule) for rule in rules)
    return DomainProfile(
        profile_id=record["profile_code"],
        module=record["domain"],
        version=record["profile_version"],
        rules=typed_rules,
    )


class SupabaseEnvironmentalProfileRepository:
    """Read-only, tenant-scoped resolver for persisted profile versions."""

    _ENVIRONMENT_SELECT = (
        "*,"
        "environment:environments!environment_context_profiles_environment_fk(location_id),"
        "sensors:environment_context_profile_sensors!"
        "environment_context_profile_sensors_profile_fk(sensor_id)"
    )
    _DOMAIN_SELECT = "id,organization_id,domain,profile_code,profile_version,rules,status,valid_from,valid_to"

    def __init__(self, client: Any):
        self._client = client

    @staticmethod
    def _data(response: Any) -> Any:
        if not hasattr(response, "data"):
            raise RuntimeError("Supabase response does not expose data")
        return response.data

    @staticmethod
    def _validate_window(from_date: str, to_date: str) -> None:
        if to_date < from_date:
            raise ValueError("scope to_date must be on or after from_date")

    @staticmethod
    def _one_profile(records: Any, *, profile_kind: str) -> Mapping[str, Any]:
        rows = records or []
        if not rows:
            raise LookupError(f"no versioned profile covers the complete {profile_kind} scope")
        if len(rows) > 1:
            raise ValueError(f"multiple versioned profiles cover the {profile_kind} scope")
        return rows[0]

    def get_environment_profile_for_scope(
        self,
        *,
        organization_id: str,
        environment_id: str,
        from_date: str,
        to_date: str,
    ) -> EnvironmentContext:
        """Resolve the one immutable environment profile covering the full window."""
        self._validate_window(from_date, to_date)
        response = (
            self._client.table("environment_context_profiles")
            .select(self._ENVIRONMENT_SELECT)
            .eq("organization_id", organization_id)
            .eq("environment_id", environment_id)
            .in_("status", ["active", "retired"])
            .lte("valid_from", from_date)
            .or_(f"valid_to.is.null,valid_to.gte.{to_date}")
            .order("valid_from", desc=True)
            .execute()
        )
        record = self._one_profile(
            self._data(response), profile_kind="environment"
        )
        if record["valid_from"] > from_date or (
            record.get("valid_to") is not None and record["valid_to"] < to_date
        ):
            raise LookupError("no versioned profile covers the complete environment scope")
        return environment_context_from_record(record)

    def get_domain_profile_for_scope(
        self,
        *,
        organization_id: str,
        domain: BiologicalDomain,
        from_date: str,
        to_date: str,
    ) -> DomainProfile:
        """Resolve the one immutable domain rule set covering the full window."""
        self._validate_window(from_date, to_date)
        response = (
            self._client.table("domain_interpretation_profiles")
            .select(self._DOMAIN_SELECT)
            .eq("organization_id", organization_id)
            .eq("domain", domain.value)
            .in_("status", ["active", "retired"])
            .lte("valid_from", from_date)
            .or_(f"valid_to.is.null,valid_to.gte.{to_date}")
            .order("valid_from", desc=True)
            .execute()
        )
        record = self._one_profile(
            self._data(response), profile_kind=f"{domain.value} domain"
        )
        if record["domain"] != domain.value:
            raise ValueError("persisted domain profile does not match requested domain")
        if record["valid_from"] > from_date or (
            record.get("valid_to") is not None and record["valid_to"] < to_date
        ):
            raise LookupError("no versioned profile covers the complete domain scope")
        return domain_profile_from_record(record)
