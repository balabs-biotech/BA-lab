"""Reference-based sensor drift screening.

A single-sensor trend is not identifiable as instrument drift: the measured
environment may genuinely change. This module therefore analyzes only
explicitly configured target/reference sensor pairs.
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from math import isfinite
from statistics import median
from typing import Iterable
from uuid import UUID

from ba_environmental_engine.sources.sensor import SensorMeasurementEnvelope


_MAX_SLOPE_SAMPLE_PAIRS = 200


@dataclass(frozen=True, slots=True)
class SensorDriftPolicy:
    target_sensor_id: UUID
    reference_sensor_id: UUID
    variable_code: str
    maximum_pair_offset_seconds: int
    minimum_pairs: int
    minimum_duration_seconds: int
    maximum_abs_drift_rate_per_hour: float


@dataclass(frozen=True, slots=True)
class SensorDriftPair:
    target_observation_id: UUID
    reference_observation_id: UUID
    observed_at: object
    differential_value: float


@dataclass(frozen=True, slots=True)
class SensorDriftAssessment:
    target_sensor_id: UUID
    reference_sensor_id: UUID
    variable_code: str
    status: str
    pair_count: int
    slope_sample_count: int
    duration_seconds: float | None
    robust_drift_rate_per_hour: float | None
    maximum_abs_drift_rate_per_hour: float
    source_target_observation_ids: tuple[UUID, ...]
    source_reference_observation_ids: tuple[UUID, ...]
    reason: str | None = None


def _validate_policy(policy: SensorDriftPolicy) -> None:
    if policy.target_sensor_id == policy.reference_sensor_id:
        raise ValueError("target and reference sensors must be different")
    if not isinstance(policy.variable_code, str) or not policy.variable_code.strip():
        raise ValueError("variable_code is required")
    for name, value, minimum in (
        ("maximum_pair_offset_seconds", policy.maximum_pair_offset_seconds, 1),
        ("minimum_pairs", policy.minimum_pairs, 3),
        ("minimum_duration_seconds", policy.minimum_duration_seconds, 1),
    ):
        if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
            raise ValueError(f"{name} must be an integer >= {minimum}")
    rate = policy.maximum_abs_drift_rate_per_hour
    if (
        isinstance(rate, bool)
        or not isinstance(rate, (int, float))
        or not isfinite(rate)
        or rate <= 0
    ):
        raise ValueError("maximum_abs_drift_rate_per_hour must be finite and positive")


def _sample_evenly(rows: list[SensorDriftPair], limit: int) -> list[SensorDriftPair]:
    if len(rows) <= limit:
        return rows
    # Deterministic sampling retains both endpoints and spans the whole period.
    indices = [round(index * (len(rows) - 1) / (limit - 1)) for index in range(limit)]
    return [rows[index] for index in indices]


def _theil_sen_slope(rows: list[SensorDriftPair]) -> tuple[float | None, int]:
    sampled = _sample_evenly(rows, _MAX_SLOPE_SAMPLE_PAIRS)
    slopes: list[float] = []
    for left, right in combinations(sampled, 2):
        elapsed_hours = (right.observed_at - left.observed_at).total_seconds() / 3600
        if elapsed_hours <= 0:
            continue
        slopes.append((right.differential_value - left.differential_value) / elapsed_hours)
    if not slopes:
        return None, len(sampled)
    return float(median(slopes)), len(sampled)


def assess_sensor_drift(
    envelopes: Iterable[SensorMeasurementEnvelope],
    policies: Iterable[SensorDriftPolicy],
) -> tuple[SensorDriftAssessment, ...]:
    """Assess target/reference differential trends under explicit policies.

    Each reference observation is consumed at most once. Matching is
    deterministic: nearest timestamp, then reference timestamp, then UUID.
    Excluded readings are ignored. No interpolation or unit conversion occurs
    here; the source adapter must already have normalized canonical units.
    """
    rows = tuple(envelopes)
    policy_rows = tuple(policies)
    policy_keys: set[tuple[UUID, UUID, str]] = set()
    for policy in policy_rows:
        _validate_policy(policy)
        key = (policy.target_sensor_id, policy.reference_sensor_id, policy.variable_code)
        if key in policy_keys:
            raise ValueError("drift policies must be unique per target/reference/variable")
        policy_keys.add(key)

    observation_ids: set[UUID] = set()
    for row in rows:
        observation_id = row.measurement.observation_id
        if observation_id in observation_ids:
            raise ValueError("measurement observation IDs must be unique")
        observation_ids.add(observation_id)
        observed_at = row.measurement.observed_at
        if observed_at.tzinfo is None or observed_at.utcoffset() is None:
            raise ValueError("measurement timestamps must include a timezone")
        value = row.measurement.value
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
            raise ValueError("measurement values must be finite numbers")

    results: list[SensorDriftAssessment] = []
    for policy in sorted(
        policy_rows,
        key=lambda item: (str(item.target_sensor_id), str(item.reference_sensor_id), item.variable_code),
    ):
        target_rows = sorted(
            (
                row for row in rows
                if row.measurement.sensor_id == policy.target_sensor_id
                and row.measurement.variable_code == policy.variable_code
                and row.quality_state != "excluded"
            ),
            key=lambda row: (row.measurement.observed_at, str(row.measurement.observation_id)),
        )
        reference_rows = sorted(
            (
                row for row in rows
                if row.measurement.sensor_id == policy.reference_sensor_id
                and row.measurement.variable_code == policy.variable_code
                and row.quality_state != "excluded"
            ),
            key=lambda row: (row.measurement.observed_at, str(row.measurement.observation_id)),
        )
        if not target_rows or not reference_rows:
            results.append(SensorDriftAssessment(
                policy.target_sensor_id, policy.reference_sensor_id, policy.variable_code,
                "not_evaluable", 0, 0, None, None,
                float(policy.maximum_abs_drift_rate_per_hour), (), (),
                "reference_pair_measurements_missing",
            ))
            continue

        target_units = {row.measurement.unit_code for row in target_rows}
        reference_units = {row.measurement.unit_code for row in reference_rows}
        if len(target_units) != 1 or len(reference_units) != 1 or target_units != reference_units:
            results.append(SensorDriftAssessment(
                policy.target_sensor_id, policy.reference_sensor_id, policy.variable_code,
                "not_evaluable", 0, 0, None, None,
                float(policy.maximum_abs_drift_rate_per_hour), (), (),
                "canonical_units_incompatible",
            ))
            continue

        unused_reference = set(range(len(reference_rows)))
        pairs: list[SensorDriftPair] = []
        for target in target_rows:
            target_at = target.measurement.observed_at
            candidates = [
                index for index in unused_reference
                if abs((reference_rows[index].measurement.observed_at - target_at).total_seconds())
                <= policy.maximum_pair_offset_seconds
            ]
            if not candidates:
                continue
            reference_index = min(
                candidates,
                key=lambda index: (
                    abs((reference_rows[index].measurement.observed_at - target_at).total_seconds()),
                    reference_rows[index].measurement.observed_at,
                    str(reference_rows[index].measurement.observation_id),
                ),
            )
            reference = reference_rows[reference_index]
            unused_reference.remove(reference_index)
            pairs.append(SensorDriftPair(
                target_observation_id=target.measurement.observation_id,
                reference_observation_id=reference.measurement.observation_id,
                observed_at=target_at,
                differential_value=float(target.measurement.value) - float(reference.measurement.value),
            ))

        if not pairs:
            results.append(SensorDriftAssessment(
                policy.target_sensor_id, policy.reference_sensor_id, policy.variable_code,
                "not_evaluable", 0, 0, None, None,
                float(policy.maximum_abs_drift_rate_per_hour), (), (),
                "no_timestamp_compatible_pairs",
            ))
            continue

        duration = (pairs[-1].observed_at - pairs[0].observed_at).total_seconds()
        if len(pairs) < policy.minimum_pairs or duration < policy.minimum_duration_seconds:
            results.append(SensorDriftAssessment(
                policy.target_sensor_id, policy.reference_sensor_id, policy.variable_code,
                "insufficient_data", len(pairs), 0, duration, None,
                float(policy.maximum_abs_drift_rate_per_hour),
                tuple(pair.target_observation_id for pair in pairs),
                tuple(pair.reference_observation_id for pair in pairs),
                "minimum_pair_count_or_duration_not_met",
            ))
            continue

        slope, sample_count = _theil_sen_slope(pairs)
        if slope is None:
            results.append(SensorDriftAssessment(
                policy.target_sensor_id, policy.reference_sensor_id, policy.variable_code,
                "not_evaluable", len(pairs), sample_count, duration, None,
                float(policy.maximum_abs_drift_rate_per_hour),
                tuple(pair.target_observation_id for pair in pairs),
                tuple(pair.reference_observation_id for pair in pairs),
                "no_distinct_pair_timestamps",
            ))
            continue

        results.append(SensorDriftAssessment(
            policy.target_sensor_id, policy.reference_sensor_id, policy.variable_code,
            "suspected" if abs(slope) > policy.maximum_abs_drift_rate_per_hour else "normal",
            len(pairs), sample_count, duration, slope,
            float(policy.maximum_abs_drift_rate_per_hour),
            tuple(pair.target_observation_id for pair in pairs),
            tuple(pair.reference_observation_id for pair in pairs),
        ))
    return tuple(results)
