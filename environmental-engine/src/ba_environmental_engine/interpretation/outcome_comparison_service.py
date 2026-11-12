"""Application service joining persisted outcome evidence to pure cohort analysis."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable
from uuid import UUID

from ba_environmental_engine.indicators.experimental_comparison import (
    ExperimentalComparisonResult,
    compare_experimental_cohorts,
)

from .supabase_outcome_comparison_repository import (
    OutcomeCohortAssignment,
    OutcomeComparisonDataset,
)


@dataclass(frozen=True, slots=True)
class PersistedOutcomeComparison:
    dataset: OutcomeComparisonDataset
    comparison: ExperimentalComparisonResult


class OutcomeComparisonService:
    """Coordinate tenant-scoped reads and deterministic descriptive analysis."""

    def __init__(self, *, repository) -> None:
        self._repository = repository

    def compare(
        self,
        *,
        organization_id: UUID,
        assignments: Iterable[OutcomeCohortAssignment],
        baseline_cohort_id: str,
        comparison_cohort_id: str,
        variable_code: str,
        accepted_quality_states: set[str] | frozenset[str],
        minimum_subjects_per_cohort: int,
    ) -> PersistedOutcomeComparison:
        dataset = self._repository.load_dataset(
            organization_id=organization_id,
            assignments=assignments,
        )
        result = compare_experimental_cohorts(
            dataset.observations,
            organization_id=str(organization_id),
            baseline_cohort_id=baseline_cohort_id,
            comparison_cohort_id=comparison_cohort_id,
            variable_code=variable_code,
            accepted_quality_states=accepted_quality_states,
            minimum_subjects_per_cohort=minimum_subjects_per_cohort,
        )
        return PersistedOutcomeComparison(dataset=dataset, comparison=result)
