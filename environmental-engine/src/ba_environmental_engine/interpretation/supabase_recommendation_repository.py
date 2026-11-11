"""Supabase RPC adapter for tenant-scoped recommendation persistence.

The caller supplies two already-configured clients:
- an authenticated user client for reads and human lifecycle transitions;
- a service-role client for trusted engine proposal creation.

The authenticated user ID must come from the same verified request context as
the user client's JWT. The database independently resolves auth.uid().
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from .models import RecommendationProposal
from .recommendation_lifecycle import (
    RecommendationLifecycle,
    RecommendationLifecycleEvent,
)
from .recommendation_repository import (
    RecommendationAccessDeniedError,
    RecommendationNotFoundError,
    RecommendationRepositoryError,
    RecommendationRevisionConflictError,
)


def _response_data(response: Any) -> Any:
    return getattr(response, "data", response)


def _one_row(data: Any) -> dict[str, Any] | None:
    if data is None:
        return None
    if isinstance(data, list):
        if not data:
            return None
        if len(data) != 1:
            raise RecommendationRepositoryError(
                "expected one recommendation row from Supabase"
            )
        data = data[0]
    if not isinstance(data, dict):
        raise RecommendationRepositoryError(
            "Supabase returned an invalid recommendation payload"
        )
    return data


def _raise_repository_error(error: Exception) -> None:
    code = getattr(error, "code", None)
    message = str(error)
    if code == "40001" or "biological_recommendation_revision_conflict" in message:
        raise RecommendationRevisionConflictError(message) from error
    if code == "P0002" or "biological_recommendation_not_found" in message:
        raise RecommendationNotFoundError(message) from error
    if code == "42501" or "write_forbidden" in message:
        raise RecommendationAccessDeniedError(message) from error
    raise RecommendationRepositoryError(message) from error


def _lifecycle_from_payload(
    recommendation: dict[str, Any],
    events: list[dict[str, Any]] | None = None,
) -> RecommendationLifecycle:
    event_rows = events or []
    revisions = [int(item["revision"]) for item in event_rows]
    if revisions != list(range(1, len(event_rows) + 1)):
        raise RecommendationRepositoryError(
            "Supabase recommendation event history has a revision gap"
        )
    if int(recommendation["revision"]) != len(event_rows):
        raise RecommendationRepositoryError(
            "Supabase recommendation snapshot revision does not match its event history"
        )

    proposal = RecommendationProposal(
        recommendation_id=recommendation["recommendation_id"],
        recommendation_code=recommendation["recommendation_code"],
        profile_id=recommendation["profile_id"],
        profile_version=recommendation["profile_version"],
        module=recommendation["module"],
        source_signal_id=recommendation["source_signal_id"],
        source_analysis_id=recommendation["source_analysis_id"],
        source_finding_id=recommendation["source_finding_id"],
        instruction_code=recommendation.get("instruction_code"),
        rationale_code=recommendation.get("rationale_code"),
        status=recommendation["proposal_status"],
        withholding_reasons=tuple(recommendation.get("withholding_reasons") or ()),
        requires_human_review=recommendation.get("requires_human_review", True),
        auto_execute=recommendation.get("auto_execute", False),
    )
    lifecycle_events = tuple(
        RecommendationLifecycleEvent(
            event_id=item["event_id"],
            action=item["action"],
            actor_id=str(item["actor_id"]),
            occurred_at=item["occurred_at"],
            note=item.get("note"),
            execution_details=item.get("execution_details"),
            outcome_summary=item.get("outcome_summary"),
            outcome_observed_at=item.get("outcome_observed_at"),
        )
        for item in event_rows
    )
    return RecommendationLifecycle(
        proposal=proposal,
        revision=recommendation["revision"],
        status=recommendation["lifecycle_status"],
        events=lifecycle_events,
        execution_details=recommendation.get("execution_details"),
        outcome_summary=recommendation.get("outcome_summary"),
        outcome_observed_at=recommendation.get("outcome_observed_at"),
    )


class SupabaseRecommendationRepository:
    """Repository adapter backed by the narrow PostgreSQL RPC contract."""

    def __init__(
        self,
        *,
        user_client: Any,
        service_client: Any,
        authenticated_user_id: UUID,
    ) -> None:
        self._user_client = user_client
        self._service_client = service_client
        self._authenticated_user_id = UUID(str(authenticated_user_id))

    def create(
        self,
        *,
        organization_id: UUID,
        lifecycle: RecommendationLifecycle,
    ) -> RecommendationLifecycle:
        if lifecycle.revision != 0 or lifecycle.events:
            raise ValueError("new recommendations must start at revision zero without events")
        if lifecycle.status != lifecycle.proposal.status:
            raise ValueError("new recommendation lifecycle must match proposal status")

        proposal = lifecycle.proposal
        params = {
            "p_organization_id": str(organization_id),
            "p_recommendation_id": str(proposal.recommendation_id),
            "p_recommendation_code": proposal.recommendation_code,
            "p_profile_id": proposal.profile_id,
            "p_profile_version": proposal.profile_version,
            "p_module": proposal.module,
            "p_source_signal_id": str(proposal.source_signal_id),
            "p_source_analysis_id": str(proposal.source_analysis_id),
            "p_source_finding_id": str(proposal.source_finding_id),
            "p_instruction_code": proposal.instruction_code,
            "p_rationale_code": proposal.rationale_code,
            "p_proposal_status": proposal.status,
            "p_withholding_reasons": list(proposal.withholding_reasons),
        }
        try:
            response = self._service_client.rpc(
                "create_biological_recommendation", params
            ).execute()
            payload = _one_row(_response_data(response))
            if payload is None or "recommendation" not in payload:
                raise RecommendationRepositoryError(
                    "Supabase did not return the created recommendation"
                )
            event_rows = payload.get("events", []) or []
            if not isinstance(event_rows, list):
                raise RecommendationRepositoryError(
                    "Supabase returned an invalid recommendation event history"
                )
            event_rows.sort(key=lambda item: item["revision"])
            return _lifecycle_from_payload(payload["recommendation"], event_rows)
        except RecommendationRepositoryError:
            raise
        except Exception as error:
            _raise_repository_error(error)

    def get(
        self,
        *,
        organization_id: UUID,
        recommendation_id: UUID,
    ) -> RecommendationLifecycle | None:
        try:
            response = (
                self._user_client.table("biological_recommendations")
                .select("*,events:biological_recommendation_events(*)")
                .eq("organization_id", str(organization_id))
                .eq("recommendation_id", str(recommendation_id))
                .maybe_single()
                .execute()
            )
            recommendation = _one_row(_response_data(response))
            if recommendation is None:
                return None

            event_rows = recommendation.pop("events", []) or []
            if not isinstance(event_rows, list):
                raise RecommendationRepositoryError(
                    "Supabase returned an invalid recommendation event history"
                )
            event_rows.sort(key=lambda item: item["revision"])
            return _lifecycle_from_payload(recommendation, event_rows)
        except RecommendationRepositoryError:
            raise
        except Exception as error:
            _raise_repository_error(error)

    def append_event(
        self,
        *,
        organization_id: UUID,
        recommendation_id: UUID,
        expected_revision: int,
        event: RecommendationLifecycleEvent,
    ) -> RecommendationLifecycle:
        try:
            event_actor_id = UUID(event.actor_id)
        except (TypeError, ValueError) as error:
            raise RecommendationAccessDeniedError(
                "event actor must be the authenticated user's UUID"
            ) from error

        if event_actor_id != self._authenticated_user_id:
            raise RecommendationAccessDeniedError(
                "event actor does not match the authenticated user"
            )

        params = {
            "p_organization_id": str(organization_id),
            "p_recommendation_id": str(recommendation_id),
            "p_expected_revision": expected_revision,
            "p_event_id": str(event.event_id),
            "p_action": event.action,
            "p_occurred_at": event.occurred_at.isoformat(),
            "p_note": event.note,
            "p_execution_details": event.execution_details,
            "p_outcome_summary": event.outcome_summary,
            "p_outcome_observed_at": (
                event.outcome_observed_at.isoformat()
                if event.outcome_observed_at is not None
                else None
            ),
        }
        try:
            response = self._user_client.rpc(
                "transition_biological_recommendation", params
            ).execute()
            payload = _one_row(_response_data(response))
            if payload is None or "recommendation" not in payload:
                raise RecommendationRepositoryError(
                    "Supabase did not return the transitioned recommendation"
                )
            event_rows = payload.get("events")
            if not isinstance(event_rows, list):
                raise RecommendationRepositoryError(
                    "Supabase did not return the committed recommendation event history"
                )
            event_rows.sort(key=lambda item: item["revision"])
            return _lifecycle_from_payload(payload["recommendation"], event_rows)
        except RecommendationRepositoryError:
            raise
        except Exception as error:
            _raise_repository_error(error)
