"""Pure, provenance-preserving calculations for biological performance evidence."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from typing import Iterable

QUALITY_STATES = frozenset({"raw", "controlled", "validated", "excluded"})


@dataclass(frozen=True, slots=True)
class BiologicalMeasurement:
    """Normalized biological measurement mapped from a tenant-scoped source row."""

    source_record_id: str
    organization_id: str
    subject_id: str
    variable_code: str
    value: float
    canonical_unit_code: str
    measured_at: datetime
    quality_state: str
    sample_id: str | None = None
    experimental_unit_id: str | None = None
    event_id: str | None = None
    result_id: str | None = None
    method: str | None = None
    instrument: str | None = None

    def __post_init__(self) -> None:
        required = (
            "source_record_id",
            "organization_id",
            "subject_id",
            "variable_code",
            "canonical_unit_code",
            "quality_state",
        )
        for field_name in required:
            if not getattr(self, field_name).strip():
                raise ValueError(f"{field_name} must not be empty")
        if self.quality_state not in QUALITY_STATES:
            raise ValueError("quality_state must match the database quality_state enum")
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
    excluded_source_record_ids: tuple[str, ...]
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
    variable_code: str,
    accepted_quality_states: set[str] | frozenset[str],
) -> BiologicalPerformanceResult:
    """Calculate first-to-last growth extent per elapsed day for one tenant/subject.

    Values must already use the variable's canonical unit. This function does
    not convert units or choose a quality policy. The caller supplies the
    admissible database quality states; the excluded state is never accepted.
    """
    if not organization_id.strip():
        raise ValueError("organization_id must not be empty")
    if not subject_id.strip():
        raise ValueError("subject_id must not be empty")
    if not variable_code.strip():
        raise ValueError("variable_code must not be empty")
    if not accepted_quality_states or not accepted_quality_states.issubset(QUALITY_STATES):
        raise ValueError("accepted_quality_states must use the database quality_state enum")

    relevant = [
        item
        for item in measurements
        if (
            item.organization_id == organization_id
            and item.subject_id == subject_id
            and item.variable_code == variable_code
        )
    ]
    source_ids = [item.source_record_id for item in relevant]
    if len(source_ids) != len(set(source_ids)):
        raise ValueError("source record IDs must be unique")

    accepted = sorted(
        (
            item
            for item in relevant
            if item.quality_state in accepted_quality_states and item.quality_state != "excluded"
        ),
        key=lambda item: item.measured_at,
    )
    accepted_ids = {item.source_record_id for item in accepted}
    excluded = tuple(
        item.source_record_id for item in relevant if item.source_record_id not in accepted_ids
    )

    def insufficient(reason: str) -> BiologicalPerformanceResult:
        return BiologicalPerformanceResult(
            status="insufficient_evidence",
            metric_code="growth_rate",
            value=None,
            unit_code=None,
            source_record_ids=tuple(item.source_record_id for item in accepted),
            excluded_source_record_ids=excluded,
            formula_code="net_growth_rate",
            formula_version="1.0.0",
            period_start=accepted[0].measured_at if accepted else None,
            period_end=accepted[-1].measured_at if accepted else None,
            accepted_count=len(accepted),
            excluded_count=len(excluded),
            reason=reason,
        )

    if len(accepted) < 2:
        return insufficient("at_least_two_quality_accepted_observations_required")

    units = {item.canonical_unit_code for item in accepted}
    if len(units) != 1:
        raise ValueError("growth extent observations must use the same canonical unit")

    first, last = accepted[0], accepted[-1]
    elapsed_seconds = (last.measured_at - first.measured_at).total_seconds()
    if elapsed_seconds <= 0:
        return insufficient("positive_elapsed_time_required")

    return BiologicalPerformanceResult(
        status="calculated",
        metric_code="growth_rate",
        value=(last.value - first.value) / (elapsed_seconds / 86400),
        unit_code=f"{first.canonical_unit_code}/day",
        source_record_ids=tuple(item.source_record_id for item in accepted),
        excluded_source_record_ids=excluded,
        formula_code="net_growth_rate",
        formula_version="1.0.0",
        period_start=first.measured_at,
        period_end=last.measured_at,
        accepted_count=len(accepted),
        excluded_count=len(excluded),
    )
