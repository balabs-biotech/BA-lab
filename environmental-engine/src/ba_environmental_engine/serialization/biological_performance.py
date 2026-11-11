"""Serialize biological performance results into the BAL biological envelope."""

from datetime import datetime
from uuid import UUID

from ba_environmental_engine.contracts.biological_analysis import (
    BALBiologicalAnalysis,
)
from ba_environmental_engine.indicators.biological_performance import (
    BiologicalPerformanceResult,
)


def build_bal_biological_analysis(
    *,
    calculation: BiologicalPerformanceResult,
    analysis_id: UUID,
    generated_at: datetime,
    engine_version: str,
    organization_id: str,
    subject_id: str,
    subject_type: str,
) -> BALBiologicalAnalysis:
    """Build a validated, provenance-preserving biological analysis envelope.

    This serializer does not fetch source records, reinterpret the calculation,
    or infer missing evidence. It transfers the calculation's explicit lineage.
    """
    if not isinstance(calculation, BiologicalPerformanceResult):
        raise TypeError("calculation must be a BiologicalPerformanceResult")

    return BALBiologicalAnalysis.model_validate(
        {
            "contract_version": "1.0.0",
            "engine": {
                "name": "ba-biological-performance",
                "version": engine_version,
            },
            "analysis_id": analysis_id,
            "generated_at": generated_at,
            "organization_id": organization_id,
            "subject": {
                "id": subject_id,
                "type": subject_type,
            },
            "status": calculation.status,
            "metric": {
                "code": calculation.metric_code,
                "value": calculation.value,
                "unit": calculation.unit_code,
            },
            "formula": {
                "code": calculation.formula_code,
                "version": calculation.formula_version,
            },
            "period": (
                {
                    "from": calculation.period_start,
                    "to": calculation.period_end,
                }
                if calculation.period_start is not None
                and calculation.period_end is not None
                else None
            ),
            "evidence": {
                "accepted_source_record_ids": list(calculation.source_record_ids),
                "excluded_source_record_ids": list(
                    calculation.excluded_source_record_ids
                ),
                "accepted_count": calculation.accepted_count,
                "excluded_count": calculation.excluded_count,
            },
            "reason": calculation.reason,
        }
    )
