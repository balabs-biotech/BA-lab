"""End-to-end biological analysis workflow with explicit persistence gates."""

from dataclasses import dataclass
from collections.abc import Mapping
from typing import Any

from ba_environmental_engine.contexts.biological import BiologicalContext
from ba_environmental_engine.contexts.environment import EnvironmentContext
from ba_environmental_engine.contracts.bal_json import BALAnalysis
from .models import DomainInterpretation, DomainProfile, RecommendationResolution
from .recommendation_lifecycle import RecommendationLifecycle
from .recommendation_service import RecommendationService
from .signal_service import BiologicalSignalService


@dataclass(frozen=True)
class BiologicalWorkflowResult:
    """Verified outputs from one interpretation and recommendation run."""

    interpretation: DomainInterpretation
    persisted_signals: tuple[Mapping[str, Any], ...]
    recommendation_resolution: RecommendationResolution
    persisted_recommendations: tuple[RecommendationLifecycle, ...]


class BiologicalWorkflowService:
    """Sequence signal persistence before recommendation persistence.

    This is orchestration only: signal generation, recommendation resolution,
    lifecycle validation and their repositories remain independently testable.
    """

    def __init__(
        self,
        *,
        signal_service: BiologicalSignalService,
        recommendation_service: RecommendationService,
    ) -> None:
        self._signal_service = signal_service
        self._recommendation_service = recommendation_service

    def run(
        self,
        *,
        analysis: BALAnalysis,
        profile: DomainProfile,
        biological_context: BiologicalContext,
        environment_context: EnvironmentContext,
    ) -> BiologicalWorkflowResult:
        """Persist source signals before deriving and storing recommendations."""
        interpretation, persisted_signals = self._signal_service.interpret_and_persist(
            analysis=analysis,
            profile=profile,
            biological_context=biological_context,
            environment_context=environment_context,
        )
        resolution, persisted_recommendations = (
            self._recommendation_service.resolve_and_persist(
                organization_id=analysis.scope.organization_id,
                interpretation=interpretation,
                profile=profile,
            )
        )
        return BiologicalWorkflowResult(
            interpretation=interpretation,
            persisted_signals=persisted_signals,
            recommendation_resolution=resolution,
            persisted_recommendations=persisted_recommendations,
        )
