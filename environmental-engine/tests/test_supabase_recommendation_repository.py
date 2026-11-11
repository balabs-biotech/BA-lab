from datetime import datetime, timezone
from uuid import uuid4

import pytest

from ba_environmental_engine.interpretation.models import RecommendationProposal
from ba_environmental_engine.interpretation.recommendation_lifecycle import (
    RecommendationLifecycle,
    RecommendationLifecycleEvent,
)
from ba_environmental_engine.interpretation.recommendation_repository import (
    RecommendationAccessDeniedError,
    RecommendationRepositoryError,
)
from ba_environmental_engine.interpretation.supabase_recommendation_repository import (
    SupabaseRecommendationRepository,
)


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeRpc:
    def __init__(self, client, name, params):
        self.client = client
        self.name = name
        self.params = params

    def execute(self):
        self.client.rpc_calls.append((self.name, self.params))
        return FakeResponse(self.client.rpc_results[self.name])


class FakeQuery:
    def __init__(self, client, table):
        self.client = client
        self.table_name = table

    def select(self, _columns):
        return self

    def eq(self, _column, _value):
        return self

    def maybe_single(self):
        return self

    def order(self, _column):
        return self

    def execute(self):
        return FakeResponse(self.client.table_results[self.table_name])


class FakeClient:
    def __init__(self, *, rpc_results=None, table_results=None):
        self.rpc_results = rpc_results or {}
        self.table_results = table_results or {}
        self.rpc_calls = []

    def rpc(self, name, params):
        return FakeRpc(self, name, params)

    def table(self, name):
        return FakeQuery(self, name)


def make_proposal():
    return RecommendationProposal(
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


def recommendation_row(proposal, *, status="proposed", revision=0):
    return {
        "recommendation_id": str(proposal.recommendation_id),
        "recommendation_code": proposal.recommendation_code,
        "profile_id": proposal.profile_id,
        "profile_version": proposal.profile_version,
        "module": proposal.module,
        "source_signal_id": str(proposal.source_signal_id),
        "source_analysis_id": str(proposal.source_analysis_id),
        "source_finding_id": str(proposal.source_finding_id),
        "instruction_code": proposal.instruction_code,
        "rationale_code": proposal.rationale_code,
        "proposal_status": proposal.status,
        "withholding_reasons": list(proposal.withholding_reasons),
        "requires_human_review": True,
        "auto_execute": False,
        "lifecycle_status": status,
        "revision": revision,
        "execution_details": None,
        "outcome_summary": None,
        "outcome_observed_at": None,
    }


def test_create_uses_service_role_rpc_and_returns_initial_snapshot():
    proposal = make_proposal()
    lifecycle = RecommendationLifecycle.from_proposal(proposal)
    service_client = FakeClient(rpc_results={
        "create_biological_recommendation": {
            "recommendation": recommendation_row(proposal),
            "events": [],
        }
    })
    repository = SupabaseRecommendationRepository(
        user_client=FakeClient(),
        service_client=service_client,
        authenticated_user_id=uuid4(),
    )

    result = repository.create(
        organization_id=uuid4(),
        lifecycle=lifecycle,
    )

    assert result == lifecycle
    assert service_client.rpc_calls[0][0] == "create_biological_recommendation"
    assert service_client.rpc_calls[0][1]["p_proposal_status"] == "proposed"


def test_create_idempotent_replay_restores_existing_lifecycle_history():
    proposal = make_proposal()
    actor_id = uuid4()
    event_time = datetime(2026, 11, 11, tzinfo=timezone.utc)
    event_id = uuid4()
    service_client = FakeClient(rpc_results={
        "create_biological_recommendation": {
            "recommendation": recommendation_row(
                proposal, status="accepted", revision=1
            ),
            "events": [{
                "event_id": str(event_id),
                "revision": 1,
                "action": "accept",
                "actor_id": str(actor_id),
                "occurred_at": event_time.isoformat(),
                "note": "Already reviewed",
                "execution_details": None,
                "outcome_summary": None,
                "outcome_observed_at": None,
            }],
            "idempotent_replay": True,
        }
    })
    repository = SupabaseRecommendationRepository(
        user_client=FakeClient(),
        service_client=service_client,
        authenticated_user_id=actor_id,
    )

    result = repository.create(
        organization_id=uuid4(),
        lifecycle=RecommendationLifecycle.from_proposal(proposal),
    )

    assert result.status == "accepted"
    assert result.revision == 1
    assert len(result.events) == 1
    assert result.events[0].event_id == event_id
    assert result.events[0].note == "Already reviewed"


def test_get_reconstructs_full_revision_ordered_history():
    proposal = make_proposal()
    actor_id = uuid4()
    event_time = datetime(2026, 11, 11, tzinfo=timezone.utc)
    event = RecommendationLifecycleEvent(
        action="accept",
        actor_id=str(actor_id),
        occurred_at=event_time,
    )
    user_client = FakeClient(table_results={
        "biological_recommendations": {
            **recommendation_row(proposal, status="accepted", revision=1),
            "events": [{
                "event_id": str(event.event_id),
                "revision": 1,
                "action": "accept",
                "actor_id": str(actor_id),
                "occurred_at": event_time.isoformat(),
                "note": None,
                "execution_details": None,
                "outcome_summary": None,
                "outcome_observed_at": None,
            }],
        }
    })
    repository = SupabaseRecommendationRepository(
        user_client=user_client,
        service_client=FakeClient(),
        authenticated_user_id=actor_id,
    )

    result = repository.get(
        organization_id=uuid4(),
        recommendation_id=proposal.recommendation_id,
    )

    assert result is not None
    assert result.status == "accepted"
    assert result.revision == 1
    assert result.events[0].event_id == event.event_id


def test_append_event_uses_authenticated_rpc_and_reloads_committed_history():
    proposal = make_proposal()
    actor_id = uuid4()
    occurred_at = datetime(2026, 11, 11, tzinfo=timezone.utc)
    event = RecommendationLifecycleEvent(
        event_id=uuid4(),
        action="accept",
        actor_id=str(actor_id),
        occurred_at=occurred_at,
        note="Validated by operator",
    )
    user_client = FakeClient(
        rpc_results={
            "transition_biological_recommendation": {
                "recommendation": recommendation_row(
                    proposal, status="accepted", revision=1
                ),
                "event": {
                    "event_id": str(event.event_id),
                    "revision": 1,
                    "action": "accept",
                    "actor_id": str(actor_id),
                    "occurred_at": occurred_at.isoformat(),
                    "note": event.note,
                    "execution_details": None,
                    "outcome_summary": None,
                    "outcome_observed_at": None,
                },
                "idempotent_replay": False,
            }
        },
        table_results={
            "biological_recommendations": {
                **recommendation_row(proposal, status="accepted", revision=1),
                "events": [{
                    "event_id": str(event.event_id),
                    "revision": 1,
                    "action": "accept",
                    "actor_id": str(actor_id),
                    "occurred_at": occurred_at.isoformat(),
                    "note": event.note,
                    "execution_details": None,
                    "outcome_summary": None,
                    "outcome_observed_at": None,
                }],
            }
        },
    )
    repository = SupabaseRecommendationRepository(
        user_client=user_client,
        service_client=FakeClient(),
        authenticated_user_id=actor_id,
    )

    result = repository.append_event(
        organization_id=uuid4(),
        recommendation_id=proposal.recommendation_id,
        expected_revision=0,
        event=event,
    )

    assert result.status == "accepted"
    assert result.revision == 1
    assert result.events[0].event_id == event.event_id
    rpc_name, params = user_client.rpc_calls[0]
    assert rpc_name == "transition_biological_recommendation"
    assert params["p_expected_revision"] == 0
    assert params["p_event_id"] == str(event.event_id)


def test_append_event_maps_database_revision_conflict():
    class ConflictRpc(FakeRpc):
        def execute(self):
            class DatabaseError(Exception):
                code = "40001"

            raise DatabaseError("biological_recommendation_revision_conflict")

    class ConflictClient(FakeClient):
        def rpc(self, name, params):
            return ConflictRpc(self, name, params)

    from ba_environmental_engine.interpretation.recommendation_repository import (
        RecommendationRevisionConflictError,
    )

    actor_id = uuid4()
    repository = SupabaseRecommendationRepository(
        user_client=ConflictClient(),
        service_client=FakeClient(),
        authenticated_user_id=actor_id,
    )
    event = RecommendationLifecycleEvent(
        action="accept",
        actor_id=str(actor_id),
        occurred_at=datetime.now(timezone.utc),
    )

    with pytest.raises(RecommendationRevisionConflictError):
        repository.append_event(
            organization_id=uuid4(),
            recommendation_id=uuid4(),
            expected_revision=0,
            event=event,
        )


def test_append_event_rejects_actor_not_bound_to_authenticated_client():
    repository = SupabaseRecommendationRepository(
        user_client=FakeClient(),
        service_client=FakeClient(),
        authenticated_user_id=uuid4(),
    )
    event = RecommendationLifecycleEvent(
        action="accept",
        actor_id=str(uuid4()),
        occurred_at=datetime.now(timezone.utc),
    )

    with pytest.raises(RecommendationAccessDeniedError):
        repository.append_event(
            organization_id=uuid4(),
            recommendation_id=uuid4(),
            expected_revision=0,
            event=event,
        )

def test_get_rejects_incomplete_or_noncontiguous_event_history():
    proposal = make_proposal()
    actor_id = uuid4()
    event_time = datetime(2026, 11, 11, tzinfo=timezone.utc)
    user_client = FakeClient(table_results={
        "biological_recommendations": {
            **recommendation_row(proposal, status="accepted", revision=1),
            "events": [{
                "event_id": str(uuid4()),
                "revision": 2,
                "action": "accept",
                "actor_id": str(actor_id),
                "occurred_at": event_time.isoformat(),
                "note": None,
                "execution_details": None,
                "outcome_summary": None,
                "outcome_observed_at": None,
            }],
        }
    })
    repository = SupabaseRecommendationRepository(
        user_client=user_client,
        service_client=FakeClient(),
        authenticated_user_id=actor_id,
    )

    with pytest.raises(RecommendationRepositoryError, match="revision gap"):
        repository.get(
            organization_id=uuid4(),
            recommendation_id=proposal.recommendation_id,
        )
