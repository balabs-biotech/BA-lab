"""Descriptive, provenance-preserving comparisons between experimental cohorts.

This module reports subject-level summaries only. It does not estimate causal
effects, calculate p-values, or select biological thresholds.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from statistics import mean, median, stdev
from typing import Iterable


@dataclass(frozen=True, slots=True)
class ExperimentalObservation:
    source_record_id: str
    organization_id: str
    subject_id: str
    subject_type: str
    cohort_id: str
    cohort_label: str
    context_signature: str
    variable_code: str
    value: float
    canonical_unit_code: str
    measured_at: datetime
    quality_state: str
    profile_id: str | None = None
    profile_version: str | None = None
    method: str | None = None
    instrument: str | None = None

    def __post_init__(self) -> None:
        required = (
            "source_record_id", "organization_id", "subject_id", "subject_type",
            "cohort_id", "cohort_label", "context_signature", "variable_code",
            "canonical_unit_code", "quality_state",
        )
        for name in required:
            if not getattr(self, name).strip():
                raise ValueError(f"{name} must not be empty")
        if self.subject_type not in {"culture", "plant_culture", "sample", "experimental_unit", "biological_subject"}:
            raise ValueError("subject_type must identify a supported biological subject")
        if isinstance(self.value, bool) or not isinstance(self.value, (int, float)) or not isfinite(self.value):
            raise ValueError("value must be finite and numeric")
        if self.quality_state not in {"raw", "controlled", "validated", "excluded"}:
            raise ValueError("quality_state must match the database quality_state enum")
        if self.measured_at.tzinfo is None or self.measured_at.utcoffset() is None:
            raise ValueError("measured_at must include a valid timezone")
        if (self.profile_id is None) != (self.profile_version is None):
            raise ValueError("profile_id and profile_version must be supplied together")


@dataclass(frozen=True, slots=True)
class CohortSummary:
    cohort_id: str
    cohort_label: str
    subject_count: int
    observation_count: int
    mean: float
    median: float
    sample_standard_deviation: float | None
    minimum: float
    maximum: float
    subject_ids: tuple[str, ...]
    source_record_ids: tuple[str, ...]
    method: str | None
    instrument: str | None


@dataclass(frozen=True, slots=True)
class ExperimentalComparisonResult:
    status: str
    organization_id: str
    variable_code: str
    canonical_unit_code: str | None
    context_signature: str
    profile_id: str | None
    profile_version: str | None
    baseline: CohortSummary | None
    comparison: CohortSummary | None
    mean_difference: float | None
    median_difference: float | None
    relative_mean_difference_percent: float | None
    minimum_subjects_per_cohort: int
    excluded_source_record_ids: tuple[str, ...]
    formula_code: str
    formula_version: str
    interpretation: str


def compare_experimental_cohorts(
    observations: Iterable[ExperimentalObservation],
    *,
    organization_id: str,
    baseline_cohort_id: str,
    comparison_cohort_id: str,
    variable_code: str,
    accepted_quality_states: set[str] | frozenset[str],
    minimum_subjects_per_cohort: int,
) -> ExperimentalComparisonResult:
    """Compare subject-level medians for two explicitly selected cohorts.

    Repeated observations are reduced to one median per subject. Cohort
    definitions, context signature, profile version and canonical units must
    match exactly. Quality policy and minimum cohort size are caller supplied.
    """
    if not organization_id.strip() or not baseline_cohort_id.strip() or not comparison_cohort_id.strip():
        raise ValueError("organization and cohort IDs must not be empty")
    if baseline_cohort_id == comparison_cohort_id:
        raise ValueError("baseline and comparison cohorts must be different")
    if not variable_code.strip():
        raise ValueError("variable_code must not be empty")
    allowed_states = {"raw", "controlled", "validated", "excluded"}
    if not accepted_quality_states or not accepted_quality_states.issubset(allowed_states):
        raise ValueError("accepted_quality_states must use the database quality_state enum")
    if "excluded" in accepted_quality_states:
        raise ValueError("excluded quality state can never be accepted")
    if isinstance(minimum_subjects_per_cohort, bool) or minimum_subjects_per_cohort < 2:
        raise ValueError("minimum_subjects_per_cohort must be at least 2")

    relevant = [
        item for item in observations
        if item.organization_id == organization_id
        and item.variable_code == variable_code
        and item.cohort_id in {baseline_cohort_id, comparison_cohort_id}
    ]
    record_ids = [item.source_record_id for item in relevant]
    if len(record_ids) != len(set(record_ids)):
        raise ValueError("source record IDs must be unique within the selected comparison")

    accepted = [item for item in relevant if item.quality_state in accepted_quality_states]
    excluded_ids = tuple(item.source_record_id for item in relevant if item not in accepted)
    if not accepted:
        return ExperimentalComparisonResult(
            status="insufficient_evidence", organization_id=organization_id,
            variable_code=variable_code, canonical_unit_code=None,
            context_signature="", profile_id=None, profile_version=None,
            baseline=None, comparison=None, mean_difference=None,
            median_difference=None, relative_mean_difference_percent=None,
            minimum_subjects_per_cohort=minimum_subjects_per_cohort,
            excluded_source_record_ids=excluded_ids,
            formula_code="subject_median_cohort_summary",
            formula_version="1.0.0",
            interpretation="No quality-accepted observations are available.",
        )

    contexts = {item.context_signature for item in accepted}
    units = {item.canonical_unit_code for item in accepted}
    profiles = {(item.profile_id, item.profile_version) for item in accepted}
    subject_types = {item.subject_type for item in accepted}
    methods = {item.method for item in accepted}
    instruments = {item.instrument for item in accepted}
    if len(contexts) != 1:
        raise ValueError("cohorts must share one declared context_signature")
    if len(units) != 1:
        raise ValueError("cohorts must use the same canonical unit")
    if len(profiles) != 1:
        raise ValueError("cohorts must share one biological profile and version")
    if len(subject_types) != 1:
        raise ValueError("cohorts must use the same biological subject type")
    if len(methods) != 1 or len(instruments) != 1:
        raise ValueError("cohorts must use the same measurement method and instrument")

    subject_cohorts: dict[str, str] = {}
    subjects_by_cohort: dict[str, dict[str, list[ExperimentalObservation]]] = {
        baseline_cohort_id: {}, comparison_cohort_id: {}
    }
    for item in accepted:
        assigned_cohort = subject_cohorts.setdefault(item.subject_id, item.cohort_id)
        if assigned_cohort != item.cohort_id:
            raise ValueError("one biological subject cannot belong to both comparison cohorts")
        subjects = subjects_by_cohort[item.cohort_id]
        subjects.setdefault(item.subject_id, []).append(item)

    def summarize(cohort_id: str) -> CohortSummary | None:
        subjects = subjects_by_cohort[cohort_id]
        if not subjects:
            return None
        subject_values = [
            median(item.value for item in sorted(rows, key=lambda row: row.measured_at))
            for _, rows in sorted(subjects.items())
        ]
        source_ids = tuple(sorted(item.source_record_id for rows in subjects.values() for item in rows))
        values = tuple(subject_values)
        labels = {item.cohort_label for rows in subjects.values() for item in rows}
        if len(labels) != 1:
            raise ValueError("cohort label must be consistent within each cohort")
        return CohortSummary(
            cohort_id=cohort_id, cohort_label=next(iter(labels)),
            subject_count=len(subjects),
            observation_count=sum(len(rows) for rows in subjects.values()),
            mean=mean(values), median=median(values),
            sample_standard_deviation=stdev(values) if len(values) > 1 else None,
            minimum=min(values), maximum=max(values),
            subject_ids=tuple(sorted(subjects)),
            source_record_ids=source_ids,
            method=next(iter(methods)),
            instrument=next(iter(instruments)),
        )

    baseline = summarize(baseline_cohort_id)
    comparison = summarize(comparison_cohort_id)
    profile_id, profile_version = next(iter(profiles))
    context_signature = next(iter(contexts))
    unit = next(iter(units))
    if (
        baseline is None or comparison is None
        or baseline.subject_count < minimum_subjects_per_cohort
        or comparison.subject_count < minimum_subjects_per_cohort
    ):
        return ExperimentalComparisonResult(
            status="insufficient_evidence", organization_id=organization_id,
            variable_code=variable_code, canonical_unit_code=unit,
            context_signature=context_signature, profile_id=profile_id,
            profile_version=profile_version, baseline=baseline,
            comparison=comparison, mean_difference=None, median_difference=None,
            relative_mean_difference_percent=None,
            minimum_subjects_per_cohort=minimum_subjects_per_cohort,
            excluded_source_record_ids=excluded_ids,
            formula_code="subject_median_cohort_summary",
            formula_version="1.0.0",
            interpretation="The explicit minimum number of independent subjects per cohort was not met.",
        )

    mean_delta = comparison.mean - baseline.mean
    median_delta = comparison.median - baseline.median
    relative_delta = (
        mean_delta / abs(baseline.mean) * 100
        if baseline.mean != 0 else None
    )
    return ExperimentalComparisonResult(
        status="descriptive_comparison", organization_id=organization_id,
        variable_code=variable_code, canonical_unit_code=unit,
        context_signature=context_signature, profile_id=profile_id,
        profile_version=profile_version, baseline=baseline,
        comparison=comparison, mean_difference=mean_delta,
        median_difference=median_delta,
        relative_mean_difference_percent=relative_delta,
        minimum_subjects_per_cohort=minimum_subjects_per_cohort,
        excluded_source_record_ids=excluded_ids,
        formula_code="subject_median_cohort_summary",
        formula_version="1.0.0",
        interpretation=(
            "Descriptive association between selected cohorts only. "
            "This comparison does not establish causality or adjust for unrecorded confounders."
        ),
    )
