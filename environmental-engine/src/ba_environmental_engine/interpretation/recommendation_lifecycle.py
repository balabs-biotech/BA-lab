"""Append-only domain lifecycle for human-reviewed recommendation proposals."""

from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import Field, field_validator, model_validator

from .models import InterpretationModel, RecommendationProposal


LifecycleStatus = Literal[
    "proposed", "withheld", "accepted", "rejected", "executed", "outcome_recorded"
]
LifecycleAction = Literal["accept", "reject", "record_execution", "record_outcome"]


class RecommendationLifecycleEvent(InterpretationModel):
    event_id: UUID = Field(default_factory=uuid4)
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
    revision: int = Field(default=0, ge=0)
    status: LifecycleStatus
    events: tuple[RecommendationLifecycleEvent, ...] = ()
    execution_details: str | None = None
    outcome_summary: str | None = None
    outcome_observed_at: datetime | None = None

    @model_validator(mode="after")
    def validate_snapshot_against_history(self):
        expected_status = self.proposal.status
        execution_details = None
        outcome_summary = None
        outcome_observed_at = None
        previous_event = None
        transitions = {
            ("proposed", "accept"): "accepted",
            ("proposed", "reject"): "rejected",
            ("accepted", "record_execution"): "executed",
            ("executed", "record_outcome"): "outcome_recorded",
        }
        for event in self.events:
            next_status = transitions.get((expected_status, event.action))
            if next_status is None:
                raise ValueError("lifecycle status does not match event history")
            if previous_event and event.occurred_at < previous_event.occurred_at:
                raise ValueError("lifecycle status does not match event history")
            if event.action == "record_execution":
                if not (event.execution_details and event.execution_details.strip()):
                    raise ValueError("lifecycle status does not match event history")
                execution_details = event.execution_details
            if event.action == "record_outcome":
                if not (event.outcome_summary and event.outcome_summary.strip()):
                    raise ValueError("lifecycle status does not match event history")
                if event.outcome_observed_at is None or previous_event is None:
                    raise ValueError("lifecycle status does not match event history")
                if not previous_event.occurred_at <= event.outcome_observed_at <= event.occurred_at:
                    raise ValueError("lifecycle status does not match event history")
                outcome_summary = event.outcome_summary
                outcome_observed_at = event.outcome_observed_at
            expected_status = next_status
            previous_event = event

        if self.revision != len(self.events):
            raise ValueError("lifecycle status does not match event history")
        if (
            self.status != expected_status
            or self.execution_details != execution_details
            or self.outcome_summary != outcome_summary
            or self.outcome_observed_at != outcome_observed_at
        ):
            raise ValueError("lifecycle status does not match event history")
        return self

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
    if lifecycle.events and event.occurred_at < lifecycle.events[-1].occurred_at:
        raise ValueError("event time cannot precede prior lifecycle event")
    if action == "record_outcome":
        execution_time = lifecycle.events[-1].occurred_at
        if not execution_time <= event.outcome_observed_at <= event.occurred_at:
            raise ValueError(
                "outcome observation time must be between execution and recording"
            )
    return RecommendationLifecycle(
        proposal=lifecycle.proposal,
        revision=lifecycle.revision + 1,
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
