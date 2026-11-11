from datetime import date
from uuid import uuid4

import pytest

from ba_environmental_engine.interpretation.models import (
    DomainInterpretation,
    DomainProfile,
    DomainSignal,
    InterpretationRule,
)
from ba_environmental_engine.interpretation.recommendations import resolve_recommendations


def make_signal(*, recommendation_code="review_fruiting_airflow", context_tags=frozenset({
    "stage:fruiting", "system:fruiting_chamber"
}), finding_status="suspect", signal_code="fruiting_environment_review"):
    return DomainSignal(
        signal_id=uuid4(),
        profile_id="mycology-fruiting",
        profile_version="1.2.0",
        module="mycology",
        rule_id="temperature-review",
        signal_code=signal_code,
        severity="moderate",
        message_code="temperature_deviation_review",
        recommendation_code=recommendation_code,
        source_analysis_id=uuid4(),
        source_finding_id=uuid4(),
        source_observation_ids=(uuid4(), uuid4()),
        variable_code="air_temperature_mean",
        observed_date=date(2026, 11, 11),
        observed_value=28.0,
        unit="degC",
        finding_status=finding_status,
        context_tags=context_tags,
    )


def make_profile():
    return DomainProfile(
        profile_id="mycology-fruiting",
        module="mycology",
        version="1.2.0",
        rules=(InterpretationRule(
            rule_id="temperature-review",
            variable_code="air_temperature_mean",
            finding_status="suspect",
            signal_code="fruiting_environment_review",
            severity="moderate",
            message_code="temperature_deviation_review",
            recommendation_code="review_fruiting_airflow",
        ),),
        recommendations=({
            "recommendation_code": "review_fruiting_airflow",
            "instruction_code": "inspect_air_exchange",
            "rationale_code": "sustained_temperature_deviation",
            "applicable_signal_codes": ("fruiting_environment_review",),
            "allowed_finding_statuses": ("suspect",),
            "required_context_tags": ("stage:fruiting", "system:fruiting_chamber"),
            "contraindicated_context_tags": ("door_open_for_maintenance",),
        },),
    )


def make_interpretation(signal):
    return DomainInterpretation(
        profile_id="mycology-fruiting",
        profile_version="1.2.0",
        module="mycology",
        signals=(signal,),
        evaluated_findings=1,
        matched_findings=1,
    )


def test_recommendation_requires_exact_profile_signal_and_context():
    profile = make_profile()
    signal = make_signal()
    result = resolve_recommendations(make_interpretation(signal), profile)

    assert len(result.proposals) == 1
    proposal = result.proposals[0]
    assert proposal.status == "proposed"
    assert proposal.instruction_code == "inspect_air_exchange"
    assert proposal.rationale_code == "sustained_temperature_deviation"
    assert proposal.requires_human_review is True
    assert proposal.auto_execute is False
    assert proposal.source_signal_id == signal.signal_id
    assert proposal.withholding_reasons == ()


def test_recommendation_is_withheld_when_required_context_is_missing():
    profile = make_profile()
    signal = make_signal(context_tags=frozenset({"stage:fruiting"}))
    result = resolve_recommendations(make_interpretation(signal), profile)

    assert result.proposals[0].status == "withheld"
    assert result.proposals[0].withholding_reasons == (
        "required_context_missing:system:fruiting_chamber",
    )


def test_recommendation_is_withheld_for_a_contraindicated_context():
    profile = make_profile()
    signal = make_signal(context_tags=frozenset({
        "stage:fruiting", "system:fruiting_chamber", "door_open_for_maintenance"
    }))
    result = resolve_recommendations(make_interpretation(signal), profile)

    assert result.proposals[0].status == "withheld"
    assert result.proposals[0].withholding_reasons == (
        "contraindicated_context:door_open_for_maintenance",
    )


def test_recommendation_is_withheld_when_signal_status_is_not_allowed():
    profile = make_profile()
    signal = make_signal(finding_status="normal")
    result = resolve_recommendations(make_interpretation(signal), profile)

    assert result.proposals[0].status == "withheld"
    assert "finding_status_not_allowed:normal" in result.proposals[0].withholding_reasons


def test_recommendation_resolution_rejects_profile_version_mismatch():
    profile = make_profile()
    interpretation = make_interpretation(
        make_signal()
    ).model_copy(update={"profile_version": "2.0.0"})

    with pytest.raises(ValueError, match="interpretation and recommendation profile must match"):
        resolve_recommendations(interpretation, profile)


def test_recommendation_catalog_codes_must_be_unique():
    profile = make_profile()
    duplicate = profile.recommendations[0]
    with pytest.raises(ValueError, match="recommendation codes must be unique"):
        DomainProfile(
            profile_id=profile.profile_id,
            module=profile.module,
            version=profile.version,
            rules=profile.rules,
            recommendations=(duplicate, duplicate),
        )

def test_recommendation_is_withheld_when_catalog_entry_is_missing():
    signal = make_signal()
    profile = DomainProfile(
        profile_id="mycology-fruiting",
        module="mycology",
        version="1.2.0",
        rules=(),
        recommendations=(),
    )
    result = resolve_recommendations(make_interpretation(signal), profile)

    assert result.proposals[0].status == "withheld"
    assert result.proposals[0].instruction_code is None
    assert result.proposals[0].withholding_reasons == ("recommendation_definition_missing",)
    assert result.proposed_count == 0
    assert result.withheld_count == 1

def test_recommendation_is_withheld_when_signal_uses_another_profile_version():
    profile = make_profile()
    signal = make_signal().model_copy(update={"profile_version": "2.0.0"})
    result = resolve_recommendations(make_interpretation(signal), profile)

    assert result.proposals[0].status == "withheld"
    assert result.proposals[0].withholding_reasons == (
        "signal_profile_version_mismatch",
    )
