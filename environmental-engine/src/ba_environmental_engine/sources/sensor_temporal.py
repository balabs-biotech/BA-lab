"""Causal robust anomaly screening for high-frequency IoT sensor streams.

This is a statistical screen, not a biological diagnosis. Each observation is
compared only with earlier usable observations from the same sensor/variable.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import isfinite
from statistics import median
from typing import Iterable, Literal
from uuid import UUID

from ba_environmental_engine.sources.sensor import SensorMeasurementEnvelope


SensorFindingStatus = Literal[
    "normal",
    "suspect",
    "insufficient_history",
    "indeterminate",
]


@dataclass(frozen=True, slots=True)
class SensorTemporalAssessment:
    observation_id: UUID
    sensor_id: UUID
    variable_code: str
    observed_at: datetime
    observed_value: float
    unit_code: str
    status: SensorFindingStatus
    flags: tuple[str, ...]
    baseline_median: float | None
    baseline_mad: float | None
    robust_z_score: float | None
    history_count: int


def _utc(value: datetime, field: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field} must include a valid timezone")
    return value.astimezone(timezone.utc)


def assess_sensor_temporal_anomalies(
    envelopes: Iterable[SensorMeasurementEnvelope],
    *,
    window_seconds: int,
    minimum_history: int,
    threshold: float,
) -> tuple[SensorTemporalAssessment, ...]:
    """Screen each usable reading against a trailing elapsed-time baseline.

    The baseline interval is [observed_at - window_seconds, observed_at).
    Excluded quality rows are retained by the source repository but are not
    assessed and never enter another observation's baseline. No cadence,
    missing value, or biological threshold is inferred.
    """
    if isinstance(window_seconds, bool) or not isinstance(window_seconds, int) or window_seconds < 1:
        raise ValueError("window_seconds must be a positive integer")
    if (
        isinstance(minimum_history, bool)
        or not isinstance(minimum_history, int)
        or minimum_history < 1
    ):
        raise ValueError("minimum_history must be a positive integer")
    if (
        isinstance(threshold, bool)
        or not isinstance(threshold, (int, float))
        or not isfinite(threshold)
        or threshold <= 0
    ):
        raise ValueError("threshold must be a finite positive number")

    groups: dict[tuple[UUID, str], list[tuple[datetime, SensorMeasurementEnvelope]]] = {}
    seen: set[tuple[UUID, str, datetime]] = set()
    for envelope in envelopes:
        measurement = envelope.measurement
        observed_at = _utc(measurement.observed_at, "measurement.observed_at")
        key = (measurement.sensor_id, measurement.variable_code, observed_at)
        if key in seen:
            raise ValueError("duplicate sensor/variable observations at the same timestamp")
        seen.add(key)
        if envelope.quality_state == "excluded":
            continue
        groups.setdefault((measurement.sensor_id, measurement.variable_code), []).append(
            (observed_at, envelope)
        )

    results: list[SensorTemporalAssessment] = []
    window = timedelta(seconds=window_seconds)
    for (sensor_id, variable_code), rows in sorted(
        groups.items(), key=lambda item: (str(item[0][0]), item[0][1])
    ):
        rows.sort(key=lambda item: item[0])
        units = {row.measurement.unit_code for _, row in rows}
        if len(units) != 1:
            raise ValueError(
                f"sensor variable {variable_code} contains incompatible canonical units"
            )
        unit_code = next(iter(units))
        history: list[tuple[datetime, float]] = []
        for observed_at, envelope in rows:
            lower_bound = observed_at - window
            history = [
                item for item in history
                if lower_bound <= item[0] < observed_at
            ]
            measurement = envelope.measurement
            value = float(measurement.value)
            count = len(history)
            if count < minimum_history:
                results.append(SensorTemporalAssessment(
                    observation_id=measurement.observation_id,
                    sensor_id=sensor_id,
                    variable_code=variable_code,
                    observed_at=observed_at,
                    observed_value=value,
                    unit_code=unit_code,
                    status="insufficient_history",
                    flags=("insufficient_history",),
                    baseline_median=None,
                    baseline_mad=None,
                    robust_z_score=None,
                    history_count=count,
                ))
            else:
                baseline = [item[1] for item in history]
                center = median(baseline)
                mad = median([abs(item - center) for item in baseline])
                if mad == 0:
                    status: SensorFindingStatus = "indeterminate"
                    flags = ("zero_mad_baseline",)
                    robust_z = None
                else:
                    robust_z = 0.6744897501960817 * (value - center) / mad
                    status = "suspect" if abs(robust_z) > threshold else "normal"
                    flags = ("robust_deviation",) if status == "suspect" else ()
                results.append(SensorTemporalAssessment(
                    observation_id=measurement.observation_id,
                    sensor_id=sensor_id,
                    variable_code=variable_code,
                    observed_at=observed_at,
                    observed_value=value,
                    unit_code=unit_code,
                    status=status,
                    flags=flags,
                    baseline_median=float(center),
                    baseline_mad=float(mad),
                    robust_z_score=robust_z,
                    history_count=count,
                ))
            history.append((observed_at, value))

    return tuple(results)
