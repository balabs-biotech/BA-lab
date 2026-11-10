"""Versioned numeric event detection for IoT sensor streams.

Rules are explicit configuration. No biological thresholds are shipped here.
Events are built from ordered, quality-filtered observations, never from means.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Literal
from uuid import UUID, uuid5

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ba_environmental_engine.sources.sensor import SensorMeasurementEnvelope

from .models import DomainModule, SignalSeverity

_SENSOR_EVENT_NAMESPACE = UUID("0c9dd0c6-0c82-4df1-a2ec-5b04a77c6e25")


class SensorEventModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class SensorEventRule(SensorEventModel):
    rule_id: str = Field(min_length=1, max_length=100)
    variable_code: str = Field(min_length=1, max_length=120)
    unit_code: str = Field(min_length=1, max_length=40)
    operator: Literal["above", "at_or_above", "below", "at_or_below"]
    threshold: float
    minimum_observations: int = Field(default=1, ge=1, le=100_000)
    minimum_duration_seconds: int = Field(default=0, ge=0, le=31_536_000)
    maximum_gap_seconds: int | None = Field(default=None, ge=1, le=31_536_000)
    accepted_quality_states: frozenset[Literal["raw", "controlled", "validated"]] = frozenset({"validated"})
    required_context_tags: frozenset[str] = frozenset()
    severity: SignalSeverity
    event_code: str = Field(min_length=1, max_length=100)
    message_code: str = Field(min_length=1, max_length=120)

    @model_validator(mode="after")
    def validate_rule(self):
        if not self.accepted_quality_states:
            raise ValueError("at least one accepted quality state is required")
        return self


class SensorEventProfile(SensorEventModel):
    profile_id: str = Field(min_length=1, max_length=100)
    module: DomainModule
    version: str = Field(min_length=1, max_length=32)
    rules: tuple[SensorEventRule, ...] = ()

    @model_validator(mode="after")
    def unique_rule_ids(self):
        ids = [rule.rule_id for rule in self.rules]
        if len(ids) != len(set(ids)):
            raise ValueError("sensor event rule IDs must be unique within a profile")
        return self


class SensorEvent(SensorEventModel):
    event_id: UUID
    profile_id: str
    profile_version: str
    module: DomainModule
    rule_id: str
    event_code: str
    severity: SignalSeverity
    message_code: str
    sensor_id: UUID
    variable_code: str
    unit_code: str
    threshold: float
    operator: str
    started_at: datetime
    ended_at: datetime
    duration_seconds: float
    observation_count: int = Field(ge=1)
    minimum_value: float
    maximum_value: float
    mean_value: float
    source_observation_ids: tuple[UUID, ...]
    context_tags: frozenset[str] = frozenset()


class SensorEventAnalysis(SensorEventModel):
    profile_id: str
    profile_version: str
    module: DomainModule
    evaluated_series: int = Field(ge=0)
    events: tuple[SensorEvent, ...] = ()


@dataclass(frozen=True, slots=True)
class _Point:
    observed_at: datetime
    value: float
    observation_id: UUID


def _matches(value: float, operator: str, threshold: float) -> bool:
    if operator == "above":
        return value > threshold
    if operator == "at_or_above":
        return value >= threshold
    if operator == "below":
        return value < threshold
    return value <= threshold


def detect_sensor_events(
    envelopes: Iterable[SensorMeasurementEnvelope],
    profile: SensorEventProfile,
    *,
    context_tags: frozenset[str] = frozenset(),
) -> SensorEventAnalysis:
    """Detect sustained threshold runs, preserving observation-level lineage.

    Excluded or unaccepted-quality measurements are not used to create events.
    They are not silently interpolated. An optional maximum gap splits a run.
    """
    rows = tuple(envelopes)
    events: list[SensorEvent] = []
    evaluated: set[tuple[UUID, str]] = set()

    for rule in profile.rules:
        groups: dict[tuple[UUID, str], list[_Point]] = {}
        for envelope in rows:
            measurement = envelope.measurement
            if measurement.variable_code != rule.variable_code:
                continue
            if measurement.unit_code != rule.unit_code:
                continue
            if envelope.quality_state not in rule.accepted_quality_states:
                continue
            if not rule.required_context_tags.issubset(context_tags):
                continue
            if measurement.origin.value != "sensor" or measurement.sensor_id is None:
                continue
            key = (measurement.sensor_id, measurement.variable_code)
            groups.setdefault(key, []).append(_Point(
                observed_at=measurement.observed_at,
                value=measurement.value,
                observation_id=measurement.observation_id,
            ))

        for (sensor_id, variable_code), points in groups.items():
            evaluated.add((sensor_id, variable_code))
            points.sort(key=lambda point: point.observed_at)
            run: list[_Point] = []

            def flush() -> None:
                if len(run) < rule.minimum_observations:
                    return
                duration = (run[-1].observed_at - run[0].observed_at).total_seconds()
                if duration < rule.minimum_duration_seconds:
                    return
                source_ids = tuple(point.observation_id for point in run)
                identity = (
                    f"{profile.profile_id}:{profile.version}:{rule.rule_id}:"
                    f"{sensor_id}:{variable_code}:{run[0].observed_at.isoformat()}:"
                    f"{run[-1].observed_at.isoformat()}"
                )
                events.append(SensorEvent(
                    event_id=uuid5(_SENSOR_EVENT_NAMESPACE, identity),
                    profile_id=profile.profile_id,
                    profile_version=profile.version,
                    module=profile.module,
                    rule_id=rule.rule_id,
                    event_code=rule.event_code,
                    severity=rule.severity,
                    message_code=rule.message_code,
                    sensor_id=sensor_id,
                    variable_code=variable_code,
                    unit_code=rule.unit_code,
                    threshold=rule.threshold,
                    operator=rule.operator,
                    started_at=run[0].observed_at,
                    ended_at=run[-1].observed_at,
                    duration_seconds=duration,
                    observation_count=len(run),
                    minimum_value=min(point.value for point in run),
                    maximum_value=max(point.value for point in run),
                    mean_value=sum(point.value for point in run) / len(run),
                    source_observation_ids=source_ids,
                    context_tags=context_tags,
                ))

            for point in points:
                if not _matches(point.value, rule.operator, rule.threshold):
                    flush()
                    run.clear()
                    continue
                if (
                    run and rule.maximum_gap_seconds is not None
                    and (point.observed_at - run[-1].observed_at).total_seconds()
                    > rule.maximum_gap_seconds
                ):
                    flush()
                    run.clear()
                run.append(point)
            flush()

    events.sort(key=lambda event: (event.started_at, event.sensor_id.hex, event.rule_id))
    return SensorEventAnalysis(
        profile_id=profile.profile_id,
        profile_version=profile.version,
        module=profile.module,
        evaluated_series=len(evaluated),
        events=tuple(events),
    )
