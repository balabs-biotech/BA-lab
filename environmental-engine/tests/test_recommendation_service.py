from datetime import date, datetime, timezone
from uuid import uuid4

import pytest

from ba_environmental_engine.interpretation.models import (
    DomainInterpretation,
    DomainProfile,
    DomainSignal,
    InterpretationRule,
    RecommendationProposal,
    RecommendationResolution,
)
from ba_environmental_engine.interpretation.recommendation_lifecycle import (
    RecommendationLifecycle,
)
from ba_environmental_engine.interpretation.recommendation_repository import (
    RecommendationNotFoundError,
)
from ba_environmental_engine.interpretation.recommendation_service import (
    RecommendationService,
)


class InMemoryRepository:
    def __init__(self, lifecycle):
        self.lifecycle = lifecycle
        self.expected_revision = None
        self.appended_event = None
        self.created_lifecycle = None
        self.created_lifecycles = []

    def create(self, *, organization_id, lifecycle):
        self.created_lifecycle = lifecycle
        self.created_lifecycles.append(lifecycle)
        self.lifecycle = lifecycle
        return lifecycle

    def get(self, *, organization_id, recommendation_id):
        if self.lifecycle.proposal.recommendation_id != recommendation_id:
            return None
        return self.lifecycle

    def append_event(
        self, *, organization_id, recommendation_id, expected_revision, event
    ):
        assert self.lifecycle.proposal.recommendation_id == recommendation_id
        assert self.lifecycle.revision == expected_revision
        self.expected_revision = expected_revision
        self.appended_event = event
        self.lifecycle = RecommendationLifecycle(
            proposal=self.lifecycle.proposal,
            revision=expected_revision + 1,
            status="accepted",
            events=(*self.lifecycle.events, event),
        )
        return self.lifecycle


def make_lifecycle():
    proposal = RecommendationProposal(
        recommendation_id=uuid4(),
        recommendation_code="review_fruiting_airflow",
        profile_id="mycology-fruiting",
        profile_version="1.2.0",
        module="mycology",
        source_signal_id=uuid4(),
        source_analysis_id=uuid4(),
        source_finding_id=uuid4(),
        instruction_code="inspect_air_exchange",
        rationale_code="sustained_temperature_deviation",
        status="proposed",
    )
    return RecommendationLifecycle.from_proposal(proposal)


def test_service_resolves_and_persists_from_exact_versioned_profile():
    organization_id = uuid4()
    signal = DomainSignal(
        signal_id=uuid4(),
        profile_id="mycology-fruiting",
        profile_version="1.2.0",
        module="mycology",
        rule_id="temperature-review",
        signal_code="fruiting_environment_review",
        severity="moderate",
        message_code="temperature_deviation_review",
        recommendation_code="review_fruiting_airflow",
        source_analysis_id=uuid4(),
        source_finding_id=uuid4(),
        source_observation_ids=(uuid4(),),
        variable_code="air_temperature_mean",
        observed_date=date(2026, 11, 11),
        observed_value=28.0,
        unit="degC",
        finding_status="suspect",
        context_tags=frozenset({"stage:fruiting", "system:fruiting_chamber"}),
    )
    profile = DomainProfile(
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
            "contraindicated_context_tags": (),
        },),
    )
    interpretation = DomainInterpretation(
        profile_id=profile.profile_id,
        profile_version=profile.version,
        module=profile.module,
        signals=(signal,),
        evaluated_findings=1,
        matched_findings=1,
    )
    repository = InMemoryRepository(None)
    service = RecommendationService(repository)

    resolution, persisted = service.resolve_and_persist(
        organization_id=organization_id,
        interpretation=interpretation,
        profile=profile,
    )

    assert resolution.proposed_count == 1
    assert resolution.withheld_count == 0
    assert len(persisted) == 1
    assert persisted[0].proposal.source_signal_id == signal.signal_id
    assert persisted[0].proposal.instruction_code == "inspect_air_exchange"
    assert repository.created_lifecycle == persisted[0]


def test_service_persists_proposed_recommendation_without_mutating_it():
    lifecycle = make_lifecycle()
    repository = InMemoryRepository(None)
    service = RecommendationService(repository)

    result = service.create(
        organization_id=uuid4(),
        proposal=lifecycle.proposal,
    )

    assert result.status == "proposed"
    assert result.revision == 0
    assert result.events == ()
    assert repository.created_lifecycle == result
    assert result.proposal == lifecycle.proposal


def test_service_persists_withheld_proposal_for_auditability():
    lifecycle = make_lifecycle()
    proposal = lifecycle.proposal.model_copy(
        update={
            "status": "withheld",
            "instruction_code": None,
            "rationale_code": None,
            "withholding_reasons": ("required_context_missing:stage:fruiting",),
        }
    )
    repository = InMemoryRepository(None)
    service = RecommendationService(repository)

    result = service.create(organization_id=uuid4(), proposal=proposal)

    assert result.status == "withheld"
    assert result.revision == 0
    assert result.events == ()
    assert result.proposal.withholding_reasons == (
        "required_context_missing:stage:fruiting",
    )


def test_service_persists_all_proposed_and_withheld_resolution_items():
    proposed = make_lifecycle().proposal
    withheld = proposed.model_copy(
        update={
            "recommendation_id": uuid4(),
            "status": "withheld",
            "instruction_code": None,
            "rationale_code": None,
            "withholding_reasons": ("contraindicated_context:stage:incubation",),
        }
    )
    resolution = RecommendationResolution(
        profile_id=proposed.profile_id,
        profile_version=proposed.profile_version,
        module=proposed.module,
        proposals=(proposed, withheld),
        proposed_count=1,
        withheld_count=1,
    )
    repository = InMemoryRepository(None)
    service = RecommendationService(repository)

    persisted = service.persist_resolution(
        organization_id=uuid4(),
        resolution=resolution,
    )

    assert [item.status for item in persisted] == ["proposed", "withheld"]
    assert len(repository.created_lifecycles) == 2
    assert [item.proposal.recommendation_id for item in persisted] == [
        proposed.recommendation_id,
        withheld.recommendation_id,
    ]


def test_service_persists_domain_event_with_current_revision():
    lifecycle = make_lifecycle()
    repository = InMemoryRepository(lifecycle)
    service = RecommendationService(repository)

    result = service.transition(
        organization_id=uuid4(),
        recommendation_id=lifecycle.proposal.recommendation_id,
        actor_id="auth-user-01",
        action="accept",
        occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
        note="Reviewed by operator",
    )

    assert result.status == "accepted"
    assert result.revision == 1
    assert repository.expected_revision == 0
    assert repository.appended_event.actor_id == "auth-user-01"


def test_service_does_not_create_or_transition_missing_recommendation():
    service = RecommendationService(InMemoryRepository(make_lifecycle()))

    with pytest.raises(RecommendationNotFoundError):
        service.transition(
            organization_id=uuid4(),
            recommendation_id=uuid4(),
            actor_id="auth-user-01",
            action="accept",
            occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
        )


def test_service_does_not_silently_override_domain_transition_rules():
    lifecycle = make_lifecycle()
    service = RecommendationService(InMemoryRepository(lifecycle))

    with pytest.raises(ValueError, match="invalid recommendation transition"):
        service.transition(
            organization_id=uuid4(),
            recommendation_id=lifecycle.proposal.recommendation_id,
            actor_id="auth-user-01",
            action="record_execution",
            occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
            execution_details="Attempted without acceptance",
        )

class RevisionConflictRepository(InMemoryRepository):
    def append_event(
        self, *, organization_id, recommendation_id, expected_revision, event
    ):
        from ba_environmental_engine.interpretation.recommendation_repository import (
            RecommendationRevisionConflictError,
        )

        self.received_organization_id = organization_id
        self.received_expected_revision = expected_revision
        raise RecommendationRevisionConflictError("stale recommendation revision")


def test_service_propagates_optimistic_concurrency_conflict():
    from ba_environmental_engine.interpretation.recommendation_repository import (
        RecommendationRevisionConflictError,
    )

    lifecycle = make_lifecycle()
    organization_id = uuid4()
    repository = RevisionConflictRepository(lifecycle)
    service = RecommendationService(repository)

    with pytest.raises(
        RecommendationRevisionConflictError,
        match="stale recommendation revision",
    ):
        service.transition(
            organization_id=organization_id,
            recommendation_id=lifecycle.proposal.recommendation_id,
            actor_id="auth-user-01",
            action="accept",
            occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
        )

    assert repository.received_organization_id == organization_id
    assert repository.received_expected_revision == 0
    assert repository.appended_event is None
