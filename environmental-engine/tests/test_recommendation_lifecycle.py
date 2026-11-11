from datetime import datetime, timezone
from uuid import uuid4

import pytest

from ba_environmental_engine.interpretation.models import (
    RecommendationProposal,
)
from ba_environmental_engine.interpretation.recommendation_lifecycle import (
    RecommendationLifecycle,
    RecommendationLifecycleEvent,
    transition_recommendation,
)


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


def make_lifecycle():
    return RecommendationLifecycle.from_proposal(make_proposal())


def test_human_can_accept_proposed_recommendation():
    state = make_lifecycle()
    updated = transition_recommendation(
        state,
        action="accept",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
        note="Inspection scheduled",
    )

    assert updated.status == "accepted"
    assert len(updated.events) == 1
    assert updated.events[0].actor_id == "operator-01"


def test_human_can_reject_proposed_recommendation():
    updated = transition_recommendation(
        make_lifecycle(),
        action="reject",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
        note="Context not suitable",
    )
    assert updated.status == "rejected"


def test_accepted_recommendation_requires_execution_record():
    accepted = transition_recommendation(
        make_lifecycle(),
        action="accept",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
    )
    with pytest.raises(ValueError, match="execution_details are required"):
        transition_recommendation(
            accepted,
            action="record_execution",
            actor_id="operator-01",
            occurred_at=datetime(2026, 11, 11, 1, tzinfo=timezone.utc),
        )


def test_executed_recommendation_requires_observed_outcome():
    accepted = transition_recommendation(
        make_lifecycle(),
        action="accept",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
    )
    executed = transition_recommendation(
        accepted,
        action="record_execution",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 11, 1, tzinfo=timezone.utc),
        execution_details="Inspected air intake; no equipment changes",
    )
    with pytest.raises(ValueError, match="outcome_summary is required"):
        transition_recommendation(
            executed,
            action="record_outcome",
            actor_id="operator-01",
            occurred_at=datetime(2026, 11, 12, tzinfo=timezone.utc),
        )


def test_full_lifecycle_preserves_separate_execution_and_outcome_events():
    accepted = transition_recommendation(
        make_lifecycle(),
        action="accept",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
    )
    executed = transition_recommendation(
        accepted,
        action="record_execution",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 11, 1, tzinfo=timezone.utc),
        execution_details="Air intake inspected; fan setting unchanged",
    )
    completed = transition_recommendation(
        executed,
        action="record_outcome",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 12, tzinfo=timezone.utc),
        outcome_summary="Temperature returned to prior range",
        outcome_observed_at=datetime(2026, 11, 12, tzinfo=timezone.utc),
    )

    assert completed.status == "outcome_recorded"
    assert [event.action for event in completed.events] == [
        "accept", "record_execution", "record_outcome"
    ]
    assert completed.execution_details == "Air intake inspected; fan setting unchanged"
    assert completed.outcome_summary == "Temperature returned to prior range"


def test_withheld_recommendation_cannot_be_accepted():
    proposal = make_proposal().model_copy(update={
        "status": "withheld",
        "withholding_reasons": ("required_context_missing:stage:fruiting",),
    })
    with pytest.raises(ValueError, match="only proposed recommendations can start review"):
        transition_recommendation(
            RecommendationLifecycle.from_proposal(proposal),
            action="accept",
            actor_id="operator-01",
            occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
        )


def test_invalid_transition_is_rejected():
    state = make_lifecycle()
    with pytest.raises(ValueError, match="invalid recommendation transition"):
        transition_recommendation(
            state,
            action="record_execution",
            actor_id="operator-01",
            occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
            execution_details="Unexpected direct execution",
        )


def test_event_timestamp_must_be_timezone_aware():
    with pytest.raises(ValueError, match="timestamps must be timezone-aware"):
        RecommendationLifecycleEvent(
            action="accept",
            actor_id="operator-01",
            occurred_at=datetime(2026, 11, 11),
        )

def test_lifecycle_events_must_be_chronological():
    accepted = transition_recommendation(
        make_lifecycle(),
        action="accept",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 11, 2, tzinfo=timezone.utc),
    )
    with pytest.raises(ValueError, match="event time cannot precede prior lifecycle event"):
        transition_recommendation(
            accepted,
            action="record_execution",
            actor_id="operator-01",
            occurred_at=datetime(2026, 11, 11, 1, tzinfo=timezone.utc),
            execution_details="Inspection completed",
        )


def test_outcome_observation_cannot_be_after_its_recording_time():
    accepted = transition_recommendation(
        make_lifecycle(),
        action="accept",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
    )
    executed = transition_recommendation(
        accepted,
        action="record_execution",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 11, 1, tzinfo=timezone.utc),
        execution_details="Inspection completed",
    )
    with pytest.raises(ValueError, match="outcome observation time must be between execution and recording"):
        transition_recommendation(
            executed,
            action="record_outcome",
            actor_id="operator-01",
            occurred_at=datetime(2026, 11, 12, tzinfo=timezone.utc),
            outcome_summary="Observed",
            outcome_observed_at=datetime(2026, 11, 13, tzinfo=timezone.utc),
        )

def test_lifecycle_snapshot_rejects_status_without_matching_history():
    state = make_lifecycle()
    with pytest.raises(ValueError, match="lifecycle status does not match event history"):
        RecommendationLifecycle(
            proposal=state.proposal,
            status="accepted",
            events=(),
        )


def test_lifecycle_snapshot_rejects_execution_without_execution_event():
    state = make_lifecycle()
    with pytest.raises(ValueError, match="lifecycle status does not match event history"):
        RecommendationLifecycle(
            proposal=state.proposal,
            status="executed",
            events=(),
            execution_details="Forged execution record",
        )

def test_lifecycle_revision_increments_once_per_appended_event():
    accepted = transition_recommendation(
        make_lifecycle(),
        action="accept",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
    )
    assert accepted.revision == 1

    executed = transition_recommendation(
        accepted,
        action="record_execution",
        actor_id="operator-01",
        occurred_at=datetime(2026, 11, 11, 1, tzinfo=timezone.utc),
        execution_details="Inspection completed",
    )
    assert executed.revision == 2
