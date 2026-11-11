from datetime import datetime, timezone
from uuid import uuid4

import pytest

from ba_environmental_engine.interpretation.models import RecommendationProposal
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
