"""Application service for human-reviewed recommendation transitions.

The caller must supply actor_id from a verified server-side auth context. The
repository remains responsible for checking that identity against the active
database principal and for committing the event with optimistic concurrency.
"""

from datetime import datetime
from uuid import UUID

from .recommendation_lifecycle import (
    LifecycleAction,
    RecommendationLifecycle,
    transition_recommendation,
)
from .recommendation_repository import (
    RecommendationNotFoundError,
    RecommendationRepository,
)


class RecommendationService:
    """Coordinate domain transitions with tenant-scoped persistence."""

    def __init__(self, repository: RecommendationRepository):
        self._repository = repository

    def create(
        self,
        *,
        organization_id: UUID,
        proposal,
    ) -> RecommendationLifecycle:
        """Persist one resolved proposal without changing its scientific content.

        Both proposed and withheld outcomes are retained for traceability. The
        repository enforces source-signal provenance and tenant ownership.
        """
        lifecycle = RecommendationLifecycle.from_proposal(proposal)
        return self._repository.create(
            organization_id=organization_id,
            lifecycle=lifecycle,
        )

    def transition(
        self,
        *,
        organization_id: UUID,
        recommendation_id: UUID,
        actor_id: str,
        action: LifecycleAction,
        occurred_at: datetime,
        note: str | None = None,
        execution_details: str | None = None,
        outcome_summary: str | None = None,
        outcome_observed_at: datetime | None = None,
    ) -> RecommendationLifecycle:
        """Load, validate, and append one event using revision compare-and-swap.

        A concurrent writer may change the aggregate after get(). In that case
        append_event must reject the stale revision; callers should reload and
        ask the human to retry rather than silently rebase the decision.
        """
        current = self._repository.get(
            organization_id=organization_id,
            recommendation_id=recommendation_id,
        )
        if current is None:
            raise RecommendationNotFoundError(
                "recommendation not found in organization"
            )

        updated = transition_recommendation(
            current,
            action=action,
            actor_id=actor_id,
            occurred_at=occurred_at,
            note=note,
            execution_details=execution_details,
            outcome_summary=outcome_summary,
            outcome_observed_at=outcome_observed_at,
        )
        event = updated.events[-1]
        return self._repository.append_event(
            organization_id=organization_id,
            recommendation_id=recommendation_id,
            expected_revision=current.revision,
            event=event,
        )
