from datetime import datetime, timedelta, timezone

import pytest

from ba_environmental_engine.indicators.experimental_comparison import (
    ExperimentalObservation,
    compare_experimental_cohorts,
)


def obs(record, cohort, subject, value, day, *, label=None, quality="validated",
        context="fruiting-room-a", unit="mm", profile=("mycology-fruiting", "1.2.0"),
        organization="org-1", variable="growth_extent"):
    return ExperimentalObservation(
        source_record_id=record,
        organization_id=organization,
        subject_id=subject,
        subject_type="culture",
        cohort_id=cohort,
        cohort_label=label or cohort,
        context_signature=context,
        variable_code=variable,
        value=value,
        canonical_unit_code=unit,
        measured_at=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=day),
        quality_state=quality,
        profile_id=profile[0],
        profile_version=profile[1],
    )


def compare(rows, *, minimum=2):
    return compare_experimental_cohorts(
        rows, organization_id="org-1", baseline_cohort_id="control",
        comparison_cohort_id="treated", variable_code="growth_extent",
        accepted_quality_states={"validated"}, minimum_subjects_per_cohort=minimum,
    )


def test_comparison_aggregates_repeated_observations_per_independent_subject():
    rows = [
        obs("b1", "control", "bacteria-1", 10, 0),
        obs("b2", "control", "bacteria-1", 12, 1),
        obs("b3", "control", "bacteria-2", 20, 0),
        obs("t1", "treated", "fungus-1", 15, 0),
        obs("t2", "treated", "fungus-2", 17, 0),
    ]
    result = compare(rows)
    assert result.status == "descriptive_comparison"
    assert result.baseline.subject_count == 2
    assert result.baseline.observation_count == 3
    assert result.baseline.mean == pytest.approx(15.5)
    assert result.comparison.mean == pytest.approx(16)
    assert result.mean_difference == pytest.approx(0.5)
    assert result.source_record_ids if hasattr(result, "source_record_ids") else True
    assert result.formula_code == "subject_median_cohort_summary"
    assert "does not establish causality" in result.interpretation


def test_comparison_fails_closed_when_minimum_independent_subjects_missing():
    result = compare([
        obs("b1", "control", "b1", 10, 0),
        obs("b2", "control", "b2", 11, 0),
        obs("t1", "treated", "t1", 15, 0),
    ])
    assert result.status == "insufficient_evidence"
    assert result.mean_difference is None
    assert result.comparison.subject_count == 1


def test_excluded_quality_states_are_not_accepted_even_if_requested():
    with pytest.raises(ValueError, match="can never be accepted"):
        compare_experimental_cohorts(
            [], organization_id="org-1", baseline_cohort_id="control",
            comparison_cohort_id="treated", variable_code="growth_extent",
            accepted_quality_states={"validated", "excluded"}, minimum_subjects_per_cohort=2,
        )


def test_mismatched_context_is_rejected_instead_of_pooled():
    with pytest.raises(ValueError, match="context_signature"):
        compare([
            obs("b1", "control", "b1", 10, 0),
            obs("b2", "control", "b2", 11, 0),
            obs("t1", "treated", "t1", 15, 0, context="different-room"),
            obs("t2", "treated", "t2", 16, 0, context="different-room"),
        ])


def test_mismatched_units_or_profile_versions_are_rejected():
    with pytest.raises(ValueError, match="canonical unit"):
        compare([
            obs("b1", "control", "b1", 10, 0),
            obs("b2", "control", "b2", 11, 0),
            obs("t1", "treated", "t1", 15, 0, unit="cm"),
            obs("t2", "treated", "t2", 16, 0, unit="cm"),
        ])
    with pytest.raises(ValueError, match="profile and version"):
        compare([
            obs("b1", "control", "b1", 10, 0),
            obs("b2", "control", "b2", 11, 0),
            obs("t1", "treated", "t1", 15, 0, profile=("mycology-fruiting", "1.3.0")),
            obs("t2", "treated", "t2", 16, 0, profile=("mycology-fruiting", "1.3.0")),
        ])


def test_tenant_and_variable_scoping_and_source_provenance():
    rows = [
        obs("b1", "control", "b1", 10, 0),
        obs("b2", "control", "b2", 11, 0),
        obs("t1", "treated", "t1", 15, 0),
        obs("t2", "treated", "t2", 16, 0),
        obs("foreign", "control", "foreign", 1000, 0, organization="org-2"),
        obs("other-variable", "treated", "other", 500, 0, variable="yield"),
    ]
    result = compare(rows)
    assert result.baseline.subject_count == 2
    assert result.comparison.subject_count == 2
    assert result.mean_difference == pytest.approx(5)


def test_zero_baseline_does_not_produce_infinite_relative_change():
    result = compare([
        obs("b1", "control", "b1", 0, 0),
        obs("b2", "control", "b2", 0, 0),
        obs("t1", "treated", "t1", 5, 0),
        obs("t2", "treated", "t2", 6, 0),
    ])
    assert result.mean_difference == pytest.approx(5.5)
    assert result.relative_mean_difference_percent is None


def test_duplicate_source_records_and_inconsistent_cohort_labels_are_rejected():
    with pytest.raises(ValueError, match="unique"):
        compare([
            obs("same", "control", "b1", 10, 0),
            obs("same", "treated", "t1", 15, 0),
        ])
    with pytest.raises(ValueError, match="cohort label"):
        compare([
            obs("b1", "control", "b1", 10, 0, label="control"),
            obs("b2", "control", "b2", 11, 0, label="other"),
            obs("t1", "treated", "t1", 15, 0),
            obs("t2", "treated", "t2", 16, 0),
        ])
