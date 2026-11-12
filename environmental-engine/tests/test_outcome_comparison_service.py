from datetime import datetime, timezone
from uuid import uuid4

from ba_environmental_engine.indicators.experimental_comparison import ExperimentalObservation
from ba_environmental_engine.interpretation.outcome_comparison_service import OutcomeComparisonService
from ba_environmental_engine.interpretation.supabase_outcome_comparison_repository import (
    OutcomeCohortAssignment,
    OutcomeComparisonDataset,
)


class StubRepository:
    def __init__(self, dataset):
        self.dataset = dataset
        self.calls = []

    def load_dataset(self, *, organization_id, assignments):
        self.calls.append((organization_id, tuple(assignments)))
        return self.dataset


def observation(source, subject, cohort, value):
    return ExperimentalObservation(
        source_record_id=source,
        organization_id="org-1",
        subject_id=subject,
        subject_type="biological_subject",
        cohort_id=cohort,
        cohort_label="Témoin" if cohort == "control" else "Traitement",
        context_signature="mycology|room-1|fruiting|1.0|biological_subject",
        variable_code="growth_extent",
        value=value,
        canonical_unit_code="mm",
        measured_at=datetime(2026, 11, 10, tzinfo=timezone.utc),
        quality_state="validated",
        profile_id="fruiting",
        profile_version="1.2",
        method="caliper",
        instrument="caliper-01",
    )


def test_service_connects_tenant_scoped_dataset_to_descriptive_comparison():
    organization_id = uuid4()
    assignments = [
        OutcomeCohortAssignment(uuid4(), "control", "Témoin"),
        OutcomeCohortAssignment(uuid4(), "control", "Témoin"),
        OutcomeCohortAssignment(uuid4(), "treated", "Traitement"),
        OutcomeCohortAssignment(uuid4(), "treated", "Traitement"),
    ]
    dataset = OutcomeComparisonDataset(
        observations=(
            observation("m1", "c1", "control", 10),
            observation("m2", "c2", "control", 12),
            observation("m3", "c3", "treated", 15),
            observation("m4", "c4", "treated", 17),
        ),
        recommendation_count=4,
        recommendations_without_subject_measurements=(),
        excluded_environmental_context_links=0,
        excluded_unusable_measurements=0,
    )
    repository = StubRepository(dataset)
    result = OutcomeComparisonService(repository=repository).compare(
        organization_id=organization_id,
        assignments=assignments,
        baseline_cohort_id="control",
        comparison_cohort_id="treated",
        variable_code="growth_extent",
        accepted_quality_states={"validated"},
        minimum_subjects_per_cohort=2,
    )
    assert result.dataset is dataset
    assert result.comparison.status == "descriptive_comparison"
    assert result.comparison.mean_difference == 5
    assert repository.calls[0][0] == organization_id
    assert len(repository.calls[0][1]) == 4


def test_service_returns_insufficient_evidence_when_quality_policy_excludes_all_rows():
    organization_id = uuid4()
    dataset = OutcomeComparisonDataset(
        observations=(observation("m1", "c1", "control", 10),),
        recommendation_count=1,
        recommendations_without_subject_measurements=(),
        excluded_environmental_context_links=0,
        excluded_unusable_measurements=0,
    )
    result = OutcomeComparisonService(repository=StubRepository(dataset)).compare(
        organization_id=organization_id,
        assignments=[OutcomeCohortAssignment(uuid4(), "control", "Témoin")],
        baseline_cohort_id="control",
        comparison_cohort_id="treated",
        variable_code="growth_extent",
        accepted_quality_states={"controlled"},
        minimum_subjects_per_cohort=2,
    )
    assert result.comparison.status == "insufficient_evidence"
    assert result.comparison.mean_difference is None
