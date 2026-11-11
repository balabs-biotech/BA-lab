"""Application orchestration for biological interpretation and signal storage."""

from collections.abc import Mapping
from typing import Protocol, Any
from uuid import UUID

from ba_environmental_engine.contexts.biological import BiologicalContext
from ba_environmental_engine.contexts.environment import EnvironmentContext
from ba_environmental_engine.contracts.bal_json import BALAnalysis
from .models import DomainInterpretation, DomainProfile
from .service import interpret_analysis_for_biological_context


class BiologicalSignalRepository(Protocol):
    """Trusted persistence boundary for generated biological signals."""

    def persist_interpretation(
        self,
        *,
        organization_id: UUID,
        interpretation: DomainInterpretation,
        biological_context: BiologicalContext,
        environment_context: EnvironmentContext,
    ) -> tuple[Mapping[str, Any], ...]: ...


class BiologicalSignalService:
    """Interpret one analysis and persist the exact versioned signal output."""

    def __init__(self, repository: BiologicalSignalRepository) -> None:
        self._repository = repository

    def interpret_and_persist(
        self,
        *,
        analysis: BALAnalysis,
        profile: DomainProfile,
        biological_context: BiologicalContext,
        environment_context: EnvironmentContext,
    ) -> tuple[DomainInterpretation, tuple[Mapping[str, Any], ...]]:
        """Run explicit rules, then persist signals with full source lineage.

        No signal is written until the interpretation has passed the domain
        context, tenant, location, environment and date-window checks.
        """
        interpretation = interpret_analysis_for_biological_context(
            analysis,
            profile,
            biological_context,
            environment_context,
        )
        persisted = self._repository.persist_interpretation(
            organization_id=analysis.scope.organization_id,
            interpretation=interpretation,
            biological_context=biological_context,
            environment_context=environment_context,
        )
        return interpretation, persisted
