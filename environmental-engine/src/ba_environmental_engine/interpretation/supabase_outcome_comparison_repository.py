"""Read-only adapter for explicitly assigned, persisted recommendation outcomes.

Cohort membership is supplied by the experiment/study layer; it is never
inferred from recommendation wording. Only immutable, linked biological-
subject measurement snapshots are loaded. Environmental-context evidence is
kept out of this first subject-level comparison path.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable
from uuid import UUID

from ba_environmental_engine.indicators.experimental_comparison import (
    ExperimentalObservation,
)


class OutcomeComparisonRepositoryError(Exception):
    """A persisted outcome dataset could not be loaded without ambiguity."""


@dataclass(frozen=True, slots=True)
class OutcomeCohortAssignment:
    recommendation_id: UUID
    cohort_id: str
    cohort_label: str

    def __post_init__(self) -> None:
        if not self.cohort_id.strip() or not self.cohort_label.strip():
            raise ValueError("cohort_id and cohort_label must not be empty")


@dataclass(frozen=True, slots=True)
class OutcomeComparisonDataset:
    observations: tuple[ExperimentalObservation, ...]
    recommendation_count: int
    recommendations_without_subject_measurements: tuple[str, ...]
    excluded_environmental_context_links: int
    excluded_unusable_measurements: int


def _data(response: Any) -> Any:
    if getattr(response, "error", None):
        raise OutcomeComparisonRepositoryError(str(response.error))
    return getattr(response, "data", response)


def _rows(value: Any, *, source: str) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list) or any(not isinstance(row, dict) for row in value):
        raise OutcomeComparisonRepositoryError(f"{source} returned an invalid row set")
    return value



def _timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as error:
            raise OutcomeComparisonRepositoryError(
                "measurement snapshot timestamp is not valid ISO-8601"
            ) from error
    else:
        raise OutcomeComparisonRepositoryError("measurement snapshot timestamp is missing")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise OutcomeComparisonRepositoryError(
            "measurement snapshot timestamp must include a timezone"
        )
    return parsed

def _numeric(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if result != result or result in (float("inf"), float("-inf")):
        return None
    return result


class SupabaseOutcomeComparisonRepository:
    """Loads tenant-scoped immutable recommendation outcome evidence."""

    def __init__(self, *, user_client: Any, max_recommendations: int = 200,
                 max_evidence_rows: int = 2000) -> None:
        if max_recommendations < 1 or max_evidence_rows < 1:
            raise ValueError("read limits must be positive")
        self._client = user_client
        self._max_recommendations = max_recommendations
        self._max_evidence_rows = max_evidence_rows

    def load_dataset(
        self,
        *,
        organization_id: UUID,
        assignments: Iterable[OutcomeCohortAssignment],
    ) -> OutcomeComparisonDataset:
        organization = str(UUID(str(organization_id)))
        selected = tuple(assignments)
        if not selected:
            raise ValueError("at least one explicit cohort assignment is required")
        recommendation_ids = [str(UUID(str(item.recommendation_id))) for item in selected]
        if len(recommendation_ids) != len(set(recommendation_ids)):
            raise ValueError("each recommendation must have exactly one cohort assignment")
        if len(recommendation_ids) > self._max_recommendations:
            raise OutcomeComparisonRepositoryError("recommendation read limit exceeded")

        assignment_by_id = {
            str(item.recommendation_id): item for item in selected
        }
        try:
            recommendation_response = (
                self._client.table("biological_recommendations")
                .select(
                    "recommendation_id,lifecycle_status,profile_id,profile_version,"
                    "module,source_signal_id"
                )
                .eq("organization_id", organization)
                .in_("recommendation_id", recommendation_ids)
                .limit(self._max_recommendations + 1)
                .execute()
            )
            recommendations = _rows(_data(recommendation_response), source="recommendations")
            if len(recommendations) > self._max_recommendations:
                raise OutcomeComparisonRepositoryError("recommendation read limit exceeded")
            by_id = {str(row.get("recommendation_id")): row for row in recommendations}
            if set(by_id) != set(recommendation_ids):
                raise OutcomeComparisonRepositoryError(
                    "one or more assigned recommendations are unavailable in this organization"
                )
            if any(row.get("lifecycle_status") != "outcome_recorded" for row in recommendations):
                raise OutcomeComparisonRepositoryError(
                    "all assigned recommendations must have a recorded outcome"
                )

            evidence_response = (
                self._client.table("biological_recommendation_outcome_measurements")
                .select(
                    "recommendation_id,outcome_event_id,measurement_id,"
                    "measurement_observed_at,variable_code,measurement_quality_state,"
                    "normalized_value,normalized_unit_code,raw_value,raw_unit_code,"
                    "method,instrument,evidence_scope"
                )
                .eq("organization_id", organization)
                .in_("recommendation_id", recommendation_ids)
                .limit(self._max_evidence_rows + 1)
                .execute()
            )
            evidence = _rows(_data(evidence_response), source="outcome evidence")
            if len(evidence) > self._max_evidence_rows:
                raise OutcomeComparisonRepositoryError("outcome evidence read limit exceeded")

            signal_ids = sorted({
                str(row.get("source_signal_id")) for row in recommendations
                if row.get("source_signal_id")
            })
            if len(signal_ids) != len(recommendations):
                raise OutcomeComparisonRepositoryError("recommendation source signal is missing")
            signal_response = (
                self._client.table("biological_signals")
                .select(
                    "signal_id,biological_subject_id,environment_id,domain,"
                    "environment_profile_code,environment_profile_version"
                )
                .eq("organization_id", organization)
                .in_("signal_id", signal_ids)
                .limit(self._max_recommendations + 1)
                .execute()
            )
            signals = _rows(_data(signal_response), source="biological signals")
        except OutcomeComparisonRepositoryError:
            raise
        except Exception as error:
            raise OutcomeComparisonRepositoryError(
                "Supabase outcome comparison read failed"
            ) from error

        signal_by_id = {str(row.get("signal_id")): row for row in signals}
        if set(signal_by_id) != set(signal_ids):
            raise OutcomeComparisonRepositoryError(
                "one or more source biological signals are unavailable"
            )

        evidence_by_recommendation: dict[str, list[dict[str, Any]]] = {}
        environmental_count = 0
        unusable_count = 0
        observations: list[ExperimentalObservation] = []
        for link in evidence:
            recommendation_id = str(link.get("recommendation_id"))
            if recommendation_id not in assignment_by_id:
                raise OutcomeComparisonRepositoryError(
                    "outcome evidence escaped the requested recommendation scope"
                )
            if link.get("evidence_scope") == "environmental_context":
                environmental_count += 1
                continue
            if link.get("evidence_scope") != "biological_subject":
                raise OutcomeComparisonRepositoryError("unknown outcome evidence scope")

            recommendation = by_id[recommendation_id]
            signal = signal_by_id[str(recommendation["source_signal_id"])]
            assignment = assignment_by_id[recommendation_id]
            normalized_value = _numeric(link.get("normalized_value"))
            normalized_unit = link.get("normalized_unit_code")
            raw_value = _numeric(link.get("raw_value"))
            raw_unit = link.get("raw_unit_code")
            if normalized_value is not None and normalized_unit:
                value, unit = normalized_value, str(normalized_unit)
            elif raw_value is not None and raw_unit:
                value, unit = raw_value, str(raw_unit)
            else:
                unusable_count += 1
                continue

            required_signal_fields = (
                "biological_subject_id", "environment_id", "domain",
                "environment_profile_code", "environment_profile_version",
            )
            if any(not signal.get(field) for field in required_signal_fields):
                raise OutcomeComparisonRepositoryError(
                    "source signal lacks biological or environmental context provenance"
                )
            if not link.get("measurement_observed_at") or not link.get("variable_code"):
                raise OutcomeComparisonRepositoryError(
                    "outcome evidence snapshot lacks measurement date or variable"
                )
            quality_state = str(link.get("measurement_quality_state") or "raw")
            if quality_state not in {"raw", "controlled", "validated", "excluded"}:
                raise OutcomeComparisonRepositoryError(
                    "outcome evidence snapshot has an unknown quality state"
                )
            source_id = ":".join((
                recommendation_id,
                str(link.get("outcome_event_id")),
                str(link.get("measurement_id")),
            ))
            context_signature = "|".join((
                str(signal["domain"]),
                str(signal["environment_id"]),
                str(signal["environment_profile_code"]),
                str(signal["environment_profile_version"]),
                "biological_subject",
            ))
            observations.append(ExperimentalObservation(
                source_record_id=source_id,
                organization_id=organization,
                subject_id=str(signal["biological_subject_id"]),
                subject_type="biological_subject",
                cohort_id=assignment.cohort_id,
                cohort_label=assignment.cohort_label,
                context_signature=context_signature,
                variable_code=str(link["variable_code"]),
                value=value,
                canonical_unit_code=unit,
                measured_at=_timestamp(link["measurement_observed_at"]),
                quality_state=quality_state,
                profile_id=str(recommendation["profile_id"]),
                profile_version=str(recommendation["profile_version"]),
                method=str(link["method"]) if link.get("method") is not None else None,
                instrument=str(link["instrument"]) if link.get("instrument") is not None else None,
            ))
            evidence_by_recommendation.setdefault(recommendation_id, []).append(link)

        without_evidence = tuple(sorted(
            recommendation_id for recommendation_id in recommendation_ids
            if recommendation_id not in evidence_by_recommendation
        ))
        return OutcomeComparisonDataset(
            observations=tuple(observations),
            recommendation_count=len(recommendations),
            recommendations_without_subject_measurements=without_evidence,
            excluded_environmental_context_links=environmental_count,
            excluded_unusable_measurements=unusable_count,
        )
