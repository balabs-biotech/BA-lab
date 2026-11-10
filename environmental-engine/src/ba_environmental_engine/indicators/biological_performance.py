"""Pure, provenance-preserving calculations for biological performance evidence.

This module deliberately consumes normalized records instead of querying the
application database. Adapters map real database rows into this contract and
explicitly decide which quality states are admissible for an analysis.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from typing import Iterable


@dataclass(frozen=True, slots=True)
class BiologicalMeasurement:
    """One numeric biological observation with its source and quality state."""
    source_record_id: str
    organization_id: str
    subject_id: str
    metric_code: str
    value: float
    unit_code: str
    measured_at: datetime
    quality_state: str
    sample_id: str | None = None
    experimental_unit_id: str | None = None
    event_id: str | None = None
    result_id: str | None = None
    method: str | None = None
    instrument: str | None = None

    def __post_init__(self) -> None:
        for field_name in (
            "source_record_id", "organization_id", "subject_id",
            "metric_code", "unit_code", "quality_state",
        ):
            if not getattr(self, field_name).strip():
                raise ValueError(f"{field_name} must not be empty")
        if (
            isinstance(self.value, bool)
            or not isinstance(self.value, (int, float))
            or not isfinite(self.value)
        ):
            raise ValueError("measurement value must be finite and numeric")
        if self.measured_at.tzinfo is None or self.measured_at.utcoffset() is None:
            raise ValueError("measured_at must include a valid timezone")


@dataclass(frozen=True, slots=True)
class BiologicalPerformanceResult:
    """A calculated indicator with complete input lineage and formula metadata."""
    status: str
    metric_code: str
    value: float | None
    unit_code: str | None
    source_record_ids: tuple[str, ...]
    formula_code: str
    formula_version: str
    period_start: datetime | None
    period_end: datetime | None
    accepted_count: int
    excluded_count: int
    reason: str | None = None


def analyze_growth_rate(
    measurements: Iterable[BiologicalMeasurement],
    *,
    organization_id: str,
    subject_id: str,
    accepted_quality_states: set[str] | frozenset[str],
) -> BiologicalPerformanceResult:
    """Calculate first-to-last growth extent per elapsed day for one subject.

    No unit conversion or application quality policy is applied here. The
    caller supplies admissible quality states. Only growth_extent records for
    the requested subject are considered.
    """
    if not organization_id.strip():
        raise ValueError("organization_id must not be empty")
    if not subject_id.strip():
        raise ValueError("subject_id must not be empty")
    if not accepted_quality_states or any(not state.strip() for state in accepted_quality_states):
        raise ValueError("accepted_quality_states must contain non-empty states")

    relevant = [
        item for item in measurements
        if (
            item.organization_id == organization_id
            and item.subject_id == subject_id
            and item.metric_code == "growth_extent"
        )
    ]
    source_ids = [item.source_record_id for item in relevant]
    if len(source_ids) != len(set(source_ids)):
        raise ValueError("source record IDs must be unique")

    accepted = sorted(
        (item for item in relevant if item.quality_state in accepted_quality_states),
        key=lambda item: item.measured_at,
    )
    excluded_count = len(relevant) - len(accepted)

    def insufficient(reason: str) -> BiologicalPerformanceResult:
        return BiologicalPerformanceResult(
            status="insufficient_evidence",
            metric_code="growth_rate",
            value=None,
            unit_code=None,
            source_record_ids=tuple(item.source_record_id for item in accepted),
            formula_code="net_growth_rate",
            formula_version="1.0.0",
            period_start=accepted[0].measured_at if accepted else None,
            period_end=accepted[-1].measured_at if accepted else None,
            accepted_count=len(accepted),
            excluded_count=excluded_count,
            reason=reason,
        )

    if len(accepted) < 2:
        return insufficient("at_least_two_quality_accepted_observations_required")

    units = {item.unit_code for item in accepted}
    if len(units) != 1:
        raise ValueError("growth extent observations must use the same unit")

    first, last = accepted[0], accepted[-1]
    elapsed_seconds = (last.measured_at - first.measured_at).total_seconds()
    if elapsed_seconds <= 0:
        return insufficient("positive_elapsed_time_required")

    elapsed_days = elapsed_seconds / 86400
    return BiologicalPerformanceResult(
        status="calculated",
        metric_code="growth_rate",
        value=(last.value - first.value) / elapsed_days,
        unit_code=f"{first.unit_code}/day",
        source_record_ids=tuple(item.source_record_id for item in accepted),
        formula_code="net_growth_rate",
        formula_version="1.0.0",
        period_start=first.measured_at,
        period_end=last.measured_at,
        accepted_count=len(accepted),
        excluded_count=excluded_count,
    )
