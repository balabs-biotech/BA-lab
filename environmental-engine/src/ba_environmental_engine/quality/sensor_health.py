"""Instrument-health diagnostics kept separate from biological interpretation.

A repeated numeric value is only a flatline *candidate*: stable real-world
conditions and sensor resolution can produce identical consecutive readings.
No default thresholds are supplied; callers must pass an explicit policy.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable
from uuid import UUID

from ba_environmental_engine.sources.sensor import SensorMeasurementEnvelope


@dataclass(frozen=True, slots=True)
class SensorFlatlineAssessment:
    sensor_id: UUID
    variable_code: str
    status: str
    observation_count: int
    longest_repeated_run: int
    longest_repeated_duration_seconds: float | None
    source_observation_ids: tuple[UUID, ...]


def assess_sensor_flatlines(
    envelopes: Iterable[SensorMeasurementEnvelope],
    *,
    minimum_repeated_observations: int | None = None,
    minimum_duration_seconds: int | None = None,
) -> tuple[SensorFlatlineAssessment, ...]:
    """Find exact-value runs under an explicitly supplied policy.

    Excluded readings break a run. Values are compared exactly after the
    existing canonical-unit normalization; no rounding or interpolation is
    applied. Missing/partial policy returns not_evaluable, not a guessed rule.
    """
    supplied = (minimum_repeated_observations is not None,
                minimum_duration_seconds is not None)
    if any(supplied) and not all(supplied):
        raise ValueError("flatline policy parameters must be supplied together")
    if all(supplied):
        if (isinstance(minimum_repeated_observations, bool)
                or not isinstance(minimum_repeated_observations, int)
                or minimum_repeated_observations < 2):
            raise ValueError("minimum_repeated_observations must be an integer >= 2")
        if (isinstance(minimum_duration_seconds, bool)
                or not isinstance(minimum_duration_seconds, int)
                or minimum_duration_seconds <= 0):
            raise ValueError("minimum_duration_seconds must be a positive integer")

    groups: dict[tuple[UUID, str], list[SensorMeasurementEnvelope]] = {}
    for envelope in envelopes:
        measurement = envelope.measurement
        if measurement.sensor_id is None:
            continue
        groups.setdefault((measurement.sensor_id, measurement.variable_code), []).append(envelope)

    results: list[SensorFlatlineAssessment] = []
    for (sensor_id, variable_code), rows in sorted(
        groups.items(), key=lambda item: (str(item[0][0]), item[0][1])
    ):
        rows.sort(key=lambda row: row.measurement.observed_at)
        usable = [row for row in rows if row.quality_state != "excluded"]
        if not all(supplied):
            results.append(SensorFlatlineAssessment(
                sensor_id=sensor_id, variable_code=variable_code,
                status="not_evaluable", observation_count=len(usable),
                longest_repeated_run=0, longest_repeated_duration_seconds=None,
                source_observation_ids=tuple(row.measurement.observation_id for row in rows),
            ))
            continue

        best_count = 0
        best_duration = 0.0
        run: list[SensorMeasurementEnvelope] = []

        def flush() -> None:
            nonlocal best_count, best_duration
            if not run:
                return
            duration = (run[-1].measurement.observed_at -
                        run[0].measurement.observed_at).total_seconds()
            if len(run) > best_count or (len(run) == best_count and duration > best_duration):
                best_count, best_duration = len(run), duration

        previous: SensorMeasurementEnvelope | None = None
        for row in rows:
            if row.quality_state == "excluded":
                flush()
                run.clear()
                previous = None
                continue
            if previous is not None and row.measurement.value == previous.measurement.value:
                run.append(row)
            else:
                flush()
                run = [row]
            previous = row
        flush()

        suspected = (best_count >= minimum_repeated_observations
                     and best_duration >= minimum_duration_seconds)
        results.append(SensorFlatlineAssessment(
            sensor_id=sensor_id, variable_code=variable_code,
            status="suspected" if suspected else ("normal" if usable else "insufficient_data"),
            observation_count=len(usable),
            longest_repeated_run=best_count,
            longest_repeated_duration_seconds=best_duration if best_count else None,
            source_observation_ids=tuple(row.measurement.observation_id for row in rows),
        ))
    return tuple(results)
