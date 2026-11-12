"""Configurable, domain-specific interpretation of environmental findings."""

from .models import (
    RecommendationDefinition,
    RecommendationProposal,
    RecommendationResolution,
)
from .recommendations import resolve_recommendations
from .recommendation_lifecycle import (
    RecommendationLifecycle,
    RecommendationLifecycleEvent,
    transition_recommendation,
)
from .recommendation_repository import (
    RecommendationAccessDeniedError,
    RecommendationNotFoundError,
    RecommendationRepository,
    RecommendationRepositoryError,
    RecommendationRevisionConflictError,
)
from .recommendation_service import RecommendationService
from .signal_persistence import (
    BiologicalSignalPersistenceError,
    SupabaseBiologicalSignalRepository,
)
from .signal_service import BiologicalSignalService
from .biological_workflow import (
    BiologicalWorkflowResult,
    BiologicalWorkflowService,
)
from .supabase_recommendation_repository import SupabaseRecommendationRepository
from .outcome_comparison_service import (
    OutcomeComparisonService,
    PersistedOutcomeComparison,
)
from .supabase_outcome_comparison_repository import (
    OutcomeCohortAssignment,
    OutcomeComparisonDataset,
    OutcomeComparisonRepositoryError,
    SupabaseOutcomeComparisonRepository,
)
from .sensor_events import (
    SensorEvent,
    SensorEventAnalysis,
    SensorEventProfile,
    SensorEventRule,
    detect_sensor_events,
)
from .sensor_service import (
    interpret_sensor_analysis,
    interpret_sensor_analysis_for_biological_context,
)
from .service import (
    interpret_analysis_for_biological_context,
    interpret_findings,
    interpret_persisted_analysis_for_subject,
    interpret_persisted_analysis_with_profiles,
)

__all__ = [
    "interpret_analysis_for_biological_context",
    "interpret_findings",
    "interpret_persisted_analysis_for_subject",
    "interpret_persisted_analysis_with_profiles",
    "interpret_sensor_analysis",
    "interpret_sensor_analysis_for_biological_context",
    "SensorEvent",
    "SensorEventAnalysis",
    "SensorEventProfile",
    "SensorEventRule",
    "detect_sensor_events",
    "RecommendationDefinition",
    "RecommendationProposal",
    "RecommendationResolution",
    "resolve_recommendations",
    "RecommendationLifecycle",
    "RecommendationLifecycleEvent",
    "transition_recommendation",
    "RecommendationRepository",
    "RecommendationRepositoryError",
    "RecommendationNotFoundError",
    "RecommendationRevisionConflictError",
    "RecommendationAccessDeniedError",
    "RecommendationService",
    "SupabaseRecommendationRepository",
    "OutcomeComparisonService",
    "PersistedOutcomeComparison",
    "OutcomeCohortAssignment",
    "OutcomeComparisonDataset",
    "OutcomeComparisonRepositoryError",
    "SupabaseOutcomeComparisonRepository",
    "BiologicalSignalPersistenceError",
    "SupabaseBiologicalSignalRepository",
    "BiologicalSignalService",
    "BiologicalWorkflowResult",
    "BiologicalWorkflowService",
]
