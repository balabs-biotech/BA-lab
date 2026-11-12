"""Strict adapter from persisted recommendation outcome evidence to cohort data.

Cohort membership and context are explicit operator declarations. This adapter
never infers a control group, subject type, canonical unit, or environmental
equivalence from recommendation text.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from typing import Any

from .experimental_comparison import ExperimentalObservation


@dataclass(frozen=True, slots=True)
class ExperimentCohortAssignment:
    organization_id: str
    experiment_id: str
    recommendation_id: str
    cohort_id: str
    cohort_label: str
    context_signature: str
    subject_type: str

    def __post_init__(self) -> None:
        for name in (
            "organization_id", "experiment_id", "recommendation_id",
            "cohort_id", "cohort_label", "context_signature", "subject_type",
        ):
            if not getattr(self, name).strip():
                raise ValueError(f"{name} must not be empty")
        if self.subject_type not in {"culture", "plant_culture", "sample", "experimental_unit"}:
            raise ValueError("subject_type must identify a supported biological subject")


def _timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("measurement_observed_at must be a valid ISO-8601 timestamp") from exc
    else:
        raise ValueError("measurement_observed_at must be a datetime or ISO-8601 string")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("measurement_observed_at must include a valid timezone")
    return parsed


def _finite_numeric(value: Any, *, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be numeric")
    parsed = float(value)
    if not isfinite(parsed):
        raise ValueError(f"{field} must be finite")
    return parsed


def outcome_evidence_rows_to_experimental_observations(
    rows: list[Mapping[str, Any]],
    *,
    assignments: Mapping[str, ExperimentCohortAssignment],
    variable_registry: Mapping[str, str],
) -> tuple[ExperimentalObservation, ...]:
    """Map joined outcome-evidence rows using explicit experiment assignments.

    Expected row fields are the recommendation snapshot, flattened source
    signal fields, and immutable outcome-measurement snapshot. Environmental
    context evidence is intentionally not treated as a biological outcome.
    """
    observations: list[ExperimentalObservation] = []
    seen_measurements: set[str] = set()

    for row in rows:
        recommendation_id = str(row.get("recommendation_id") or "").strip()
        if not recommendation_id:
            raise ValueError("recommendation_id is required")
        assignment = assignments.get(recommendation_id)
        if assignment is None:
            raise ValueError("every outcome recommendation needs an explicit cohort assignment")

        organization_id = str(row.get("organization_id") or "").strip()
        if organization_id != assignment.organization_id:
            raise ValueError("outcome evidence and cohort assignment organization must match")
        if row.get("lifecycle_status") != "outcome_recorded":
            raise ValueError("only recommendations with a recorded outcome are eligible")
        if row.get("evidence_scope") != "biological_subject":
            continue

        domain = str(row.get("signal_domain") or "")
        expected_subject_type = {"mycology": "culture", "greentech": "plant_culture"}.get(domain)
        if expected_subject_type and assignment.subject_type != expected_subject_type:
            raise ValueError("cohort subject_type does not match the persisted biological domain")
        if domain not in {"mycology", "greentech", "lab"}:
            raise ValueError("persisted signal domain is missing or unsupported")
        if row.get("module") != domain:
            raise ValueError("recommendation module does not match its source signal domain")

        subject_id = str(row.get("signal_biological_subject_id") or "").strip()
        if not subject_id:
            raise ValueError("source signal biological subject is required")
        measurement_id = str(row.get("measurement_id") or "").strip()
        outcome_event_id = str(row.get("outcome_event_id") or "").strip()
        if not measurement_id or not outcome_event_id:
            raise ValueError("outcome measurement and event IDs are required")
        if measurement_id in seen_measurements:
            raise ValueError("duplicate recommendation outcome measurement evidence")
        seen_measurements.add(measurement_id)

        variable_code = str(row.get("variable_code") or "").strip()
        canonical_unit = variable_registry.get(variable_code)
        if not variable_code or not isinstance(canonical_unit, str) or not canonical_unit.strip():
            raise ValueError("outcome measurement variable is missing from the canonical unit registry")

        quality_state = row.get("measurement_quality_state")
        if quality_state not in {"raw", "controlled", "validated", "excluded"}:
            raise ValueError("immutable measurement quality state is missing or invalid")

        normalized_unit = row.get("normalized_unit_code")
        if row.get("normalized_value") is not None and normalized_unit == canonical_unit:
            value = _finite_numeric(row["normalized_value"], field="normalized_value")
            value_source = "normalized"
        elif row.get("raw_value") is not None and row.get("raw_unit_code") == canonical_unit:
            value = _finite_numeric(row["raw_value"], field="raw_value")
            value_source = "raw"
        else:
            raise ValueError("outcome evidence has no value proven to use the canonical unit")

        profile_id = str(row.get("profile_id") or "").strip()
        profile_version = str(row.get("profile_version") or "").strip()
        if not profile_id or not profile_version:
            raise ValueError("recommendation biological profile and version are required")

        observations.append(
            ExperimentalObservation(
                source_record_id=measurement_id,
                organization_id=organization_id,
                subject_id=subject_id,
                subject_type=assignment.subject_type,
                cohort_id=assignment.cohort_id,
                cohort_label=assignment.cohort_label,
                context_signature=assignment.context_signature,
                variable_code=variable_code,
                value=value,
                canonical_unit_code=canonical_unit,
                measured_at=_timestamp(row.get("measurement_observed_at")),
                quality_state=quality_state,
                profile_id=profile_id,
                profile_version=profile_version,
                method=str(row["method"]) if row.get("method") is not None else None,
                instrument=str(row["instrument"]) if row.get("instrument") is not None else None,
            )
        )

    return tuple(observations)
