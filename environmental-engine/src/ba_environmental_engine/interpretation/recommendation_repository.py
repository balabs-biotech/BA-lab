"""Tenant-scoped persistence port for human-reviewed recommendations.

Concrete adapters must enforce authorization and atomicity; this module only
defines the boundary consumed by application services.
"""

from typing import Protocol
from uuid import UUID

from .recommendation_lifecycle import (
    RecommendationLifecycle,
    RecommendationLifecycleEvent,
)


class RecommendationRepositoryError(Exception):
    """Base class for recommendation persistence failures."""


class RecommendationNotFoundError(RecommendationRepositoryError):
    """The recommendation does not exist in the requested organization."""


class RecommendationRevisionConflictError(RecommendationRepositoryError):
    """The stored revision differs from the caller's expected revision."""


class RecommendationAccessDeniedError(RecommendationRepositoryError):
    """The authenticated principal is not authorized for this operation."""


class RecommendationRepository(Protocol):
    """Persistence contract for organization-scoped recommendation aggregates.

    Implementations must derive the actor from the authenticated server context
    and reject an event whose actor_id does not match that principal. The
    organization_id is a scope selector, never proof of membership.
    """

    def create(
        self,
        *,
        organization_id: UUID,
        lifecycle: RecommendationLifecycle,
    ) -> RecommendationLifecycle:
        """Persist a new proposal with revision zero and no lifecycle events.

        Proposal provenance is immutable after creation. Implementations must
        reject duplicate recommendation IDs within an organization.
        """

    def get(
        self,
        *,
        organization_id: UUID,
        recommendation_id: UUID,
    ) -> RecommendationLifecycle | None:
        """Load one aggregate after verifying organization membership."""

    def append_event(
        self,
        *,
        organization_id: UUID,
        recommendation_id: UUID,
        expected_revision: int,
        event: RecommendationLifecycleEvent,
    ) -> RecommendationLifecycle:
        """Atomically append one event and return the new aggregate.

        The adapter must lock or compare-and-swap the aggregate revision,
        validate the transition against the persisted state, and commit the
        event plus new current-state projection in one transaction. Replaying
        an event UUID must be idempotent only when its immutable payload is
        byte-for-byte equivalent; conflicting reuse must fail.
        """
