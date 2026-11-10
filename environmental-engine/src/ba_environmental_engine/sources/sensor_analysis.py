"""Descriptive analysis for IoT sensor time series.

Sensor data deliberately follows a separate path from gridded weather inputs:
this module does not run FAO-56, infer missing values, or merge providers.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from math import sqrt
from statistics import mean, median
from typing import Iterable
from uuid import UUID

from ba_environmental_engine.sources.sensor import SensorMeasurementEnvelope


@dataclass(frozen=True, slots=True)
class SensorSeriesSummary:
    sensor_id: UUID
    variable_code: str
    unit_code: str
    status: str
    observation_count: int
    usable_count: int
    excluded_count: int
    quality_counts: dict[str, int]
    minimum: float | None
    maximum: float | None
    mean: float | None
    median: float | None
    standard_deviation: float | None
    expected_count: int | None
    availability_ratio: float | None
    gap_count: int | None
    maximum_gap_seconds: float | None
    source_observation_ids: tuple[UUID, ...]


@dataclass(frozen=True, slots=True)
class SensorAnalysis:
    from_at: datetime
    to_at_exclusive: datetime
    series: tuple[SensorSeriesSummary, ...]
    total_observations: int
    excluded_observations: int


def _aware_utc(value: datetime, field: str) -> datetime:
    from datetime import timezone

    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{field} must include a valid timezone")
    return value.astimezone(timezone.utc)


def summarize_sensor_measurements(
    envelopes: Iterable[SensorMeasurementEnvelope],
    *,
    from_at: datetime,
    to_at_exclusive: datetime,
    expected_interval_seconds: int | None = None,
) -> SensorAnalysis:
    """Summarize sensor/variable streams in a half-open UTC interval.

    Only quality_state='excluded' is removed from numeric statistics. Its
    count, reason-bearing envelope and source ID remain available to callers.
    Coverage is computed only when a nominal sampling interval is supplied;
    no cadence is guessed from observed data.
    """
    start = _aware_utc(from_at, "from_at")
    end = _aware_utc(to_at_exclusive, "to_at_exclusive")
    if end <= start:
        raise ValueError("to_at_exclusive must be after from_at")
    if expected_interval_seconds is not None and (
        isinstance(expected_interval_seconds, bool)
        or not isinstance(expected_interval_seconds, int)
        or expected_interval_seconds <= 0
    ):
        raise ValueError("expected_interval_seconds must be a positive integer")

    groups: dict[tuple[UUID, str], list[SensorMeasurementEnvelope]] = defaultdict(list)
    seen: set[tuple[UUID, str, datetime]] = set()
    accepted: list[SensorMeasurementEnvelope] = []
    for envelope in envelopes:
        measurement = envelope.measurement
        observed_at = _aware_utc(measurement.observed_at, "measurement.observed_at")
        if not start <= observed_at < end:
            continue
        key = (measurement.sensor_id, measurement.variable_code, observed_at)
        if key in seen:
            raise ValueError("duplicate sensor/variable observations at the same timestamp")
        seen.add(key)
        groups[(measurement.sensor_id, measurement.variable_code)].append(envelope)
        accepted.append(envelope)

    summaries: list[SensorSeriesSummary] = []
    for (sensor_id, variable_code), rows in sorted(
        groups.items(), key=lambda item: (str(item[0][0]), item[0][1])
    ):
        units = {row.measurement.unit_code for row in rows}
        if len(units) != 1:
            raise ValueError(
                f"sensor variable {variable_code} contains incompatible canonical units"
            )
        unit_code = next(iter(units))
        quality_counts = dict(Counter(row.quality_state for row in rows))
        usable = sorted(
            (
                row for row in rows
                if row.quality_state != "excluded"
            ),
            key=lambda row: _aware_utc(row.measurement.observed_at, "observed_at"),
        )
        values = [row.measurement.value for row in usable]
        times = [
            _aware_utc(row.measurement.observed_at, "observed_at")
            for row in usable
        ]
        gaps = [
            (right - left).total_seconds()
            for left, right in zip(times, times[1:])
        ]
        expected_count = None
        availability = None
        gap_count = None
        maximum_gap = None
        if expected_interval_seconds is not None:
            duration = (end - start).total_seconds()
            expected_count = int((duration + expected_interval_seconds - 1) // expected_interval_seconds)
            availability = min(1.0, len(usable) / expected_count) if expected_count else None
            gap_count = sum(gap > expected_interval_seconds * 1.5 for gap in gaps)
            maximum_gap = max(gaps, default=0.0)

        summaries.append(SensorSeriesSummary(
            sensor_id=sensor_id,
            variable_code=variable_code,
            unit_code=unit_code,
            status="ok" if values else "insufficient_data",
            observation_count=len(rows),
            usable_count=len(usable),
            excluded_count=len(rows) - len(usable),
            quality_counts=quality_counts,
            minimum=min(values) if values else None,
            maximum=max(values) if values else None,
            mean=mean(values) if values else None,
            median=median(values) if values else None,
            standard_deviation=(
                sqrt(sum((value - mean(values)) ** 2 for value in values) / len(values))
                if values else None
            ),
            expected_count=expected_count,
            availability_ratio=availability,
            gap_count=gap_count,
            maximum_gap_seconds=maximum_gap,
            source_observation_ids=tuple(row.measurement.observation_id for row in rows),
        ))

    return SensorAnalysis(
        from_at=start,
        to_at_exclusive=end,
        series=tuple(summaries),
        total_observations=len(accepted),
        excluded_observations=sum(row.quality_state == "excluded" for row in accepted),
    )
