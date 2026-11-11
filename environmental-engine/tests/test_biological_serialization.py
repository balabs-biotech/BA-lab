from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from ba_environmental_engine.contracts.biological_analysis import BALBiologicalAnalysis
from ba_environmental_engine.indicators.biological_performance import (
    BiologicalPerformanceResult,
)
from ba_environmental_engine.serialization.biological_performance import (
    build_bal_biological_analysis,
)


def result(*, status="calculated"):
    return BiologicalPerformanceResult(
        status=status,
        metric_code="extent_growth_rate",
        value=4.0 if status == "calculated" else None,
        unit_code="mm/day" if status == "calculated" else None,
        source_record_ids=("m1", "m2"),
        excluded_source_record_ids=("m3",),
        formula_code="net_extent_rate",
        formula_version="1.0.0",
        period_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
        period_end=datetime(2026, 1, 4, tzinfo=timezone.utc),
        accepted_count=2,
        excluded_count=1,
        reason=None if status == "calculated" else "at_least_two_quality_accepted_observations_required",
    )


def build(calculation):
    return build_bal_biological_analysis(
        calculation=calculation,
        analysis_id=uuid4(),
        generated_at=datetime(2026, 1, 5, tzinfo=timezone.utc),
        engine_version="0.1.0",
        organization_id="org-1",
        subject_id="culture-1",
        subject_type="culture",
    )


def test_biological_result_serializes_formula_period_and_complete_lineage():
    payload = build(result()).model_dump(mode="json", by_alias=True)
    assert payload["engine"]["name"] == "ba-biological-performance"
    assert payload["subject"]["id"] == "culture-1"
    assert payload["metric"]["value"] == 4.0
    assert payload["metric"]["unit"] == "mm/day"
    assert payload["formula"] == {"code": "net_extent_rate", "version": "1.0.0"}
    assert payload["evidence"]["accepted_source_record_ids"] == ["m1", "m2"]
    assert payload["evidence"]["excluded_source_record_ids"] == ["m3"]
    assert payload["period"]["from"] == "2026-01-01T00:00:00Z"


def test_insufficient_biological_evidence_serializes_null_value_not_zero():
    payload = build(result(status="insufficient_evidence"))
    assert payload.status == "insufficient_evidence"
    assert payload.metric.value is None
    assert payload.reason == "at_least_two_quality_accepted_observations_required"


def test_biological_contract_rejects_lineage_count_mismatch():
    payload = build(result()).model_dump(mode="python", by_alias=True)
    payload["evidence"]["accepted_count"] = 1
    with pytest.raises(ValidationError, match="accepted_count"):
        BALBiologicalAnalysis.model_validate(payload)


def test_biological_contract_rejects_naive_generated_timestamp():
    payload = build(result()).model_dump(mode="python")
    payload["generated_at"] = datetime(2026, 1, 5)
    with pytest.raises(ValidationError, match="timezone"):
        BALBiologicalAnalysis.model_validate(payload)


def test_biological_contract_rejects_duplicate_source_ids():
    payload = build(result()).model_dump(mode="python")
    payload["evidence"]["accepted_source_record_ids"] = ["m1", "m1"]
    with pytest.raises(ValidationError, match="unique"):
        BALBiologicalAnalysis.model_validate(payload)
