"""Application service for human-reviewed recommendation transitions.

The caller must supply actor_id from a verified server-side auth context. The
repository remains responsible for checking that identity against the active
database principal and for committing the event with optimistic concurrency.
"""

from datetime import datetime
from uuid import UUID

from .models import (
    DomainInterpretation,
    DomainProfile,
    RecommendationProposal,
    RecommendationResolution,
)
from .recommendations import resolve_recommendations
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
        proposal: RecommendationProposal,
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

    def persist_resolution(
        self,
        *,
        organization_id: UUID,
        resolution: RecommendationResolution,
    ) -> tuple[RecommendationLifecycle, ...]:
        """Persist every proposed and withheld result from one resolution.

        Each proposal has a deterministic ID and an idempotent create RPC, so
        an interrupted batch can be safely replayed without duplicating rows.
        The batch is intentionally not presented as one database transaction.
        """
        return tuple(
            self.create(organization_id=organization_id, proposal=proposal)
            for proposal in resolution.proposals
        )

    def resolve_and_persist(
        self,
        *,
        organization_id: UUID,
        interpretation: DomainInterpretation,
        profile: DomainProfile,
    ) -> tuple[RecommendationResolution, tuple[RecommendationLifecycle, ...]]:
        """Resolve configured actions and persist their complete audit outcome.

        The source biological signals must already have been persisted by the
        trusted signal pipeline. The database verifies every proposal's source
        signal, analysis, finding and profile provenance before accepting it.
        """
        resolution = resolve_recommendations(interpretation, profile)
        persisted = self.persist_resolution(
            organization_id=organization_id,
            resolution=resolution,
        )
        return resolution, persisted

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
