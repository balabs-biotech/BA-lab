"""Persistence adapter for immutable biological interpretation signals.

Writes use a server-side Supabase client only. Tenant, analysis, context and
profile lineage are checked again by PostgreSQL constraints; this adapter
never accepts client-provided provenance fields.
"""

from collections.abc import Mapping
from typing import Any
from uuid import UUID

from ba_environmental_engine.contexts.biological import BiologicalContext
from ba_environmental_engine.contexts.environment import EnvironmentContext
from .models import DomainInterpretation


class BiologicalSignalPersistenceError(RuntimeError):
    """A signal batch could not be persisted or verified."""


_SIGNAL_CONFLICT_KEY = ",".join(
    (
        "organization_id",
        "source_analysis_id",
        "source_finding_id",
        "rule_id",
        "biological_context_id",
        "domain_profile_code",
        "domain_profile_version",
        "environment_profile_code",
        "environment_profile_version",
    )
)


class SupabaseBiologicalSignalRepository:
    """Persist engine-produced signals with tenant and lineage constraints.

    The injected client must be a trusted server-side client. Never pass a
    browser client or expose its service-role credential. Replays preserve
    existing operational status because conflicts are ignored, not updated.
    """

    def __init__(self, service_client: Any) -> None:
        self._client = service_client

    @staticmethod
    def _response_data(response: Any) -> list[Mapping[str, Any]]:
        data = getattr(response, "data", None)
        if not isinstance(data, list):
            raise BiologicalSignalPersistenceError(
                "Supabase did not return a row collection"
            )
        return data

    def persist_interpretation(
        self,
        *,
        organization_id: UUID,
        interpretation: DomainInterpretation,
        biological_context: BiologicalContext,
        environment_context: EnvironmentContext,
    ) -> tuple[Mapping[str, Any], ...]:
        """Insert an interpretation batch idempotently and verify every signal."""
        if biological_context.organization_id != organization_id:
            raise ValueError("biological context belongs to another organization")
        if environment_context.organization_id != organization_id:
            raise ValueError("environment context belongs to another organization")
        if biological_context.environment_context_id != environment_context.context_id:
            raise ValueError("biological context is bound to another environment")
        if biological_context.domain.value != interpretation.module:
            raise ValueError("interpretation module does not match biological context")
        if not interpretation.profile_id.strip() or not interpretation.profile_version.strip():
            raise ValueError("interpretation must identify its exact domain profile")

        if not interpretation.signals:
            return ()

        rows: list[dict[str, Any]] = []
        signal_ids: list[str] = []
        for signal in interpretation.signals:
            if signal.profile_id != interpretation.profile_id:
                raise ValueError("signal profile code differs from interpretation")
            if signal.profile_version != interpretation.profile_version:
                raise ValueError("signal profile version differs from interpretation")
            if signal.module != interpretation.module:
                raise ValueError("signal module differs from interpretation")
            if signal.source_analysis_id is None:
                raise ValueError("signal must retain its source analysis")
            if signal.biological_context_id != biological_context.context_id:
                raise ValueError("signal biological context differs from persisted context")
            if signal.biological_subject_id != biological_context.subject_id:
                raise ValueError("signal biological subject differs from persisted context")
            if signal.environment_context_id != environment_context.context_id:
                raise ValueError("signal environment differs from persisted environment")

            signal_id = str(signal.signal_id)
            signal_ids.append(signal_id)
            rows.append(
                {
                    "organization_id": str(organization_id),
                    "signal_id": signal_id,
                    "domain": signal.module,
                    "signal_code": signal.signal_code,
                    "severity": signal.severity,
                    "message_code": signal.message_code,
                    "recommendation_code": signal.recommendation_code,
                    "rule_id": signal.rule_id,
                    "source_analysis_id": str(signal.source_analysis_id),
                    "source_finding_id": str(signal.source_finding_id),
                    "biological_context_id": str(biological_context.context_id),
                    "biological_subject_id": str(biological_context.subject_id),
                    "environment_id": str(environment_context.context_id),
                    "domain_profile_code": interpretation.profile_id,
                    "domain_profile_version": interpretation.profile_version,
                    "environment_profile_code": environment_context.profile_code,
                    "environment_profile_version": environment_context.profile_version,
                    "variable_code": signal.variable_code,
                    "observed_date": signal.observed_date.isoformat(),
                    "observed_value": signal.observed_value,
                    "unit": signal.unit,
                    "finding_status": signal.finding_status,
                    "source_observation_ids": [
                        str(item) for item in signal.source_observation_ids
                    ],
                    "context_tags": sorted(signal.context_tags),
                }
            )

        if len(signal_ids) != len(set(signal_ids)):
            raise ValueError("interpretation contains duplicate signal IDs")

        try:
            self._client.table("biological_signals").upsert(
                rows,
                on_conflict=_SIGNAL_CONFLICT_KEY,
                ignore_duplicates=True,
            ).execute()
            response = (
                self._client.table("biological_signals")
                .select("*")
                .eq("organization_id", str(organization_id))
                .in_("signal_id", signal_ids)
                .execute()
            )
            persisted = self._response_data(response)
        except BiologicalSignalPersistenceError:
            raise
        except Exception as error:
            raise BiologicalSignalPersistenceError(
                "Supabase failed to persist biological interpretation signals"
            ) from error

        by_id = {str(row.get("signal_id")): row for row in persisted}
        missing = sorted(set(signal_ids) - set(by_id))
        if missing:
            raise BiologicalSignalPersistenceError(
                "one or more signal rows conflicted with existing provenance "
                "or could not be verified"
            )
        return tuple(by_id[signal_id] for signal_id in signal_ids)
