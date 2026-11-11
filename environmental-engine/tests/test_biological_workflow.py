from uuid import uuid4

import pytest

from ba_environmental_engine.interpretation.biological_workflow import (
    BiologicalWorkflowService,
)
from ba_environmental_engine.interpretation.models import (
    DomainInterpretation,
    RecommendationResolution,
)


class FakeSignalService:
    def __init__(self, result=None, error=None, calls=None):
        self.result = result
        self.error = error
        self.calls = calls if calls is not None else []

    def interpret_and_persist(self, **kwargs):
        self.calls.append("signals")
        if self.error:
            raise self.error
        return self.result


class FakeRecommendationService:
    def __init__(self, result, calls):
        self.result = result
        self.calls = calls

    def resolve_and_persist(self, **kwargs):
        self.calls.append(("recommendations", kwargs["interpretation"]))
        return self.result


def test_workflow_persists_signals_before_resolving_recommendations():
    organization_id = uuid4()
    interpretation = DomainInterpretation(
        profile_id="mycology-fruiting",
        profile_version="2.0.0",
        module="mycology",
        signals=(),
        evaluated_findings=0,
        matched_findings=0,
    )
    persisted_signals = ({"signal_id": str(uuid4())},)
    resolution = RecommendationResolution(
        profile_id="mycology-fruiting",
        profile_version="2.0.0",
        module="mycology",
        proposals=(),
        proposed_count=0,
        withheld_count=0,
    )
    calls = []
    workflow = BiologicalWorkflowService(
        signal_service=FakeSignalService(
            result=(interpretation, persisted_signals),
            calls=calls,
        ),
        recommendation_service=FakeRecommendationService(
            result=(resolution, ()),
            calls=calls,
        ),
    )

    result = workflow.run(
        analysis=type("Analysis", (), {
            "scope": type("Scope", (), {"organization_id": organization_id})()
        })(),
        profile=object(),
        biological_context=object(),
        environment_context=object(),
    )

    assert calls == ["signals", ("recommendations", interpretation)]
    assert result.interpretation is interpretation
    assert result.persisted_signals == persisted_signals
    assert result.recommendation_resolution is resolution
    assert result.persisted_recommendations == ()


def test_workflow_stops_before_recommendations_when_signal_persistence_fails():
    calls = []
    workflow = BiologicalWorkflowService(
        signal_service=FakeSignalService(
            error=RuntimeError("signal persistence failed"),
            calls=calls,
        ),
        recommendation_service=FakeRecommendationService(
            result=(None, ()),
            calls=calls,
        ),
    )

    with pytest.raises(RuntimeError, match="signal persistence failed"):
        workflow.run(
            analysis=object(),
            profile=object(),
            biological_context=object(),
            environment_context=object(),
        )

    assert calls == ["signals"]
