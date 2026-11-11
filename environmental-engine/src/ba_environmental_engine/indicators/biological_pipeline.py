"""Provider-neutral orchestration for biological measurement analysis.

The repository supplies an already tenant-scoped row snapshot and variable
registry. This module performs deterministic mapping, scope selection and
indicator calculation without database or UI dependencies.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from ba_environmental_engine.indicators.biological_performance import (
    BiologicalPerformanceResult,
    analyze_extent_growth_rate,
)
from ba_environmental_engine.indicators.measurement_adapter import (
    measurement_row_to_biological_measurement,
)


_SUBJECT_LINKS = {
    "culture": "culture_id",
    "plant_culture": "plant_culture_id",
    "sample": "sample_id",
    "experimental_unit": "experimental_unit_id",
}


@dataclass(frozen=True, slots=True)
class RejectedMeasurementRow:
    """A candidate source row that could not satisfy the evidence contract."""

    source_record_id: str | None
    reason: str


@dataclass(frozen=True, slots=True)
class BiologicalAnalysisPipelineResult:
    """Calculation output plus transparent accounting of the supplied snapshot."""

    calculation: BiologicalPerformanceResult
    input_row_count: int
    candidate_row_count: int
    ignored_out_of_scope_count: int
    rejected_rows: tuple[RejectedMeasurementRow, ...]

    @property
    def status(self) -> str:
        return self.calculation.status


def analyze_measurement_rows(
    rows: Iterable[Mapping[str, object]],
    *,
    organization_id: str,
    subject_id: str,
    subject_type: str,
    variable_code: str,
    variable_registry: Mapping[str, str],
    accepted_quality_states: set[str] | frozenset[str],
) -> BiologicalAnalysisPipelineResult:
    """Run the v1 extent-growth indicator over one supplied measurement snapshot.

    Rows from other organizations, variables, or biological subjects are ignored
    before adaptation. The repository remains responsible for tenant-scoped
    retrieval; these filters are defense in depth, not an authorization boundary.
    Invalid in-scope rows are reported rather than silently discarded.
    """
    if not organization_id.strip():
        raise ValueError("organization_id must not be empty")
    if not subject_id.strip():
        raise ValueError("subject_id must not be empty")
    if not variable_code.strip():
        raise ValueError("variable_code must not be empty")

    snapshot = tuple(rows)
    mapped = []
    rejected: list[RejectedMeasurementRow] = []
    candidate_count = 0

    for row in snapshot:
        if not isinstance(row, Mapping):
            raise TypeError("every measurement row must be a mapping")

        row_organization = str(row.get("organization_id") or "").strip()
        row_variable = str(row.get("variable_code") or "").strip()
        if row_organization != organization_id or row_variable != variable_code:
            continue

        subject_field = _SUBJECT_LINKS.get(subject_type)
        if subject_field is None:
            raise ValueError("subject_type must identify a supported biological subject")
        linked_subjects = [
            row.get(field)
            for field in _SUBJECT_LINKS.values()
            if row.get(field) is not None
        ]
        if linked_subjects and row.get(subject_field) != subject_id:
            continue

        candidate_count += 1
        raw_id = row.get("id")
        source_id = str(raw_id).strip() if raw_id is not None else None
        source_id = source_id or None
        try:
            mapped.append(
                measurement_row_to_biological_measurement(
                    row,
                    variable_registry=variable_registry,
                )
            )
        except (TypeError, ValueError) as exc:
            rejected.append(
                RejectedMeasurementRow(
                    source_record_id=source_id,
                    reason=str(exc),
                )
            )

    calculation = analyze_extent_growth_rate(
        mapped,
        organization_id=organization_id,
        subject_id=subject_id,
        subject_type=subject_type,
        variable_code=variable_code,
        accepted_quality_states=accepted_quality_states,
    )
    return BiologicalAnalysisPipelineResult(
        calculation=calculation,
        input_row_count=len(snapshot),
        candidate_row_count=candidate_count,
        ignored_out_of_scope_count=len(snapshot) - candidate_count,
        rejected_rows=tuple(rejected),
    )
