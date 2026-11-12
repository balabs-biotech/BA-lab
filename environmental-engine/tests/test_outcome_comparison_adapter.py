from datetime import datetime, timezone

import pytest

from ba_environmental_engine.indicators.outcome_comparison_adapter import (
    ExperimentCohortAssignment,
    outcome_evidence_rows_to_experimental_observations,
)


def assignment(recommendation_id, cohort="control", *, organization="org-1", subject_type="culture"):
    return ExperimentCohortAssignment(
        organization_id=organization,
        experiment_id="experiment-1",
        recommendation_id=recommendation_id,
        cohort_id=cohort,
        cohort_label=cohort.title(),
        context_signature="protocol:v1|fruiting:18-20c",
        subject_type=subject_type,
    )


def row(recommendation_id="rec-1", *, measurement="m-1", scope="biological_subject",
        quality="validated", domain="mycology", normalized=12, normalized_unit="mm",
        raw=1.2, raw_unit="cm", organization="org-1", status="outcome_recorded"):
    return {
        "organization_id": organization,
        "recommendation_id": recommendation_id,
        "lifecycle_status": status,
        "profile_id": "fruiting-profile",
        "profile_version": "1.0.0",
        "module": domain,
        "signal_domain": domain,
        "signal_biological_subject_id": "culture-1",
        "measurement_id": measurement,
        "outcome_event_id": "outcome-event-1",
        "measurement_observed_at": datetime(2026, 11, 12, tzinfo=timezone.utc),
        "variable_code": "growth_extent",
        "normalized_value": normalized,
        "normalized_unit_code": normalized_unit,
        "raw_value": raw,
        "raw_unit_code": raw_unit,
        "measurement_quality_state": quality,
        "method": "caliper",
        "instrument": "digital-caliper-01",
        "evidence_scope": scope,
    }


def test_maps_explicit_cohort_and_immutable_measurement_provenance():
    result = outcome_evidence_rows_to_experimental_observations(
        [row()], assignments={"rec-1": assignment("rec-1")},
        variable_registry={"growth_extent": "mm"},
    )
    assert len(result) == 1
    assert result[0].value == 12
    assert result[0].canonical_unit_code == "mm"
    assert result[0].quality_state == "validated"
    assert result[0].cohort_id == "control"
    assert result[0].method == "caliper"
    assert result[0].instrument == "digital-caliper-01"


def test_uses_raw_value_only_when_raw_unit_is_exactly_canonical():
    source = row(normalized=None, normalized_unit=None, raw=12, raw_unit="mm")
    result = outcome_evidence_rows_to_experimental_observations(
        [source], assignments={"rec-1": assignment("rec-1")},
        variable_registry={"growth_extent": "mm"},
    )
    assert result[0].value == 12


def test_environmental_context_evidence_is_not_a_biological_outcome():
    result = outcome_evidence_rows_to_experimental_observations(
        [row(scope="environmental_context")],
        assignments={"rec-1": assignment("rec-1")},
        variable_registry={"growth_extent": "mm"},
    )
    assert result == ()


def test_missing_quality_snapshot_fails_closed():
    source = row()
    source["measurement_quality_state"] = None
    with pytest.raises(ValueError, match="quality state is missing"):
        outcome_evidence_rows_to_experimental_observations(
            [source], assignments={"rec-1": assignment("rec-1")},
            variable_registry={"growth_extent": "mm"},
        )


def test_unassigned_or_unrecorded_recommendations_are_rejected():
    with pytest.raises(ValueError, match="explicit cohort assignment"):
        outcome_evidence_rows_to_experimental_observations(
            [row()], assignments={}, variable_registry={"growth_extent": "mm"},
        )
    with pytest.raises(ValueError, match="recorded outcome"):
        outcome_evidence_rows_to_experimental_observations(
            [row(status="executed")], assignments={"rec-1": assignment("rec-1")},
            variable_registry={"growth_extent": "mm"},
        )


def test_wrong_tenant_or_domain_subject_type_is_rejected():
    with pytest.raises(ValueError, match="organization must match"):
        outcome_evidence_rows_to_experimental_observations(
            [row(organization="org-2")],
            assignments={"rec-1": assignment("rec-1")},
            variable_registry={"growth_extent": "mm"},
        )
    with pytest.raises(ValueError, match="subject_type does not match"):
        outcome_evidence_rows_to_experimental_observations(
            [row(domain="greentech")],
            assignments={"rec-1": assignment("rec-1")},
            variable_registry={"growth_extent": "mm"},
        )


def test_noncanonical_units_and_duplicate_evidence_are_rejected():
    with pytest.raises(ValueError, match="no value proven"):
        outcome_evidence_rows_to_experimental_observations(
            [row(normalized=12, normalized_unit="cm", raw=1.2, raw_unit="cm")],
            assignments={"rec-1": assignment("rec-1")},
            variable_registry={"growth_extent": "mm"},
        )
    with pytest.raises(ValueError, match="duplicate"):
        outcome_evidence_rows_to_experimental_observations(
            [row(), row()], assignments={"rec-1": assignment("rec-1")},
            variable_registry={"growth_extent": "mm"},
        )
