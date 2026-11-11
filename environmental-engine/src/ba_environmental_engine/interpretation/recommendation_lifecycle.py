"""Append-only domain lifecycle for human-reviewed recommendation proposals."""

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from .models import InterpretationModel, RecommendationProposal


LifecycleStatus = Literal[
    "proposed", "withheld", "accepted", "rejected", "executed", "outcome_recorded"
]
LifecycleAction = Literal["accept", "reject", "record_execution", "record_outcome"]


class RecommendationLifecycleEvent(InterpretationModel):
    action: LifecycleAction
    actor_id: str = Field(min_length=1, max_length=160)
    occurred_at: datetime
    note: str | None = Field(default=None, max_length=2000)
    execution_details: str | None = Field(default=None, max_length=4000)
    outcome_summary: str | None = Field(default=None, max_length=4000)
    outcome_observed_at: datetime | None = None

    @field_validator("occurred_at", "outcome_observed_at")
    @classmethod
    def require_timezone_aware_datetime(cls, value):
        if value is not None and (
            value.tzinfo is None or value.utcoffset() is None
        ):
            raise ValueError("timestamps must be timezone-aware")
        return value


class RecommendationLifecycle(InterpretationModel):
    proposal: RecommendationProposal
    status: LifecycleStatus
    events: tuple[RecommendationLifecycleEvent, ...] = ()
    execution_details: str | None = None
    outcome_summary: str | None = None
    outcome_observed_at: datetime | None = None

    @classmethod
    def from_proposal(cls, proposal: RecommendationProposal):
        return cls(
            proposal=proposal,
            status=proposal.status,
        )


def transition_recommendation(
    lifecycle: RecommendationLifecycle,
    *,
    action: LifecycleAction,
    actor_id: str,
    occurred_at: datetime,
    note: str | None = None,
    execution_details: str | None = None,
    outcome_summary: str | None = None,
    outcome_observed_at: datetime | None = None,
) -> RecommendationLifecycle:
    """Return a new lifecycle snapshot and append one immutable event.

    This is a domain transition only. It neither authenticates actor_id nor
    persists data; the application/repository boundary must enforce both.
    """
    allowed = {
        ("proposed", "accept"): "accepted",
        ("proposed", "reject"): "rejected",
        ("accepted", "record_execution"): "executed",
        ("executed", "record_outcome"): "outcome_recorded",
    }
    if lifecycle.status == "withheld":
        raise ValueError("only proposed recommendations can start review")
    next_status = allowed.get((lifecycle.status, action))
    if next_status is None:
        raise ValueError("invalid recommendation transition")

    if action == "record_execution" and not (
        execution_details and execution_details.strip()
    ):
        raise ValueError("execution_details are required")
    if action == "record_outcome":
        if not (outcome_summary and outcome_summary.strip()):
            raise ValueError("outcome_summary is required")
        if outcome_observed_at is None:
            raise ValueError("outcome_observed_at is required")

    event = RecommendationLifecycleEvent(
        action=action,
        actor_id=actor_id,
        occurred_at=occurred_at,
        note=note,
        execution_details=execution_details,
        outcome_summary=outcome_summary,
        outcome_observed_at=outcome_observed_at,
    )
    return RecommendationLifecycle(
        proposal=lifecycle.proposal,
        status=next_status,
        events=(*lifecycle.events, event),
        execution_details=(
            execution_details
            if action == "record_execution"
            else lifecycle.execution_details
        ),
        outcome_summary=(
            outcome_summary
            if action == "record_outcome"
            else lifecycle.outcome_summary
        ),
        outcome_observed_at=(
            outcome_observed_at
            if action == "record_outcome"
            else lifecycle.outcome_observed_at
        ),
    )
