"""Map pure temporal screens into the versioned BAL-JSON findings contract."""

from datetime import date
from uuid import UUID, uuid5

from ba_environmental_engine.contracts.bal_json import AnomalyFinding, IndicatorMethod
from ba_environmental_engine.quality.temporal import TemporalAssessment

_TEMPORAL_FINDING_NAMESPACE = UUID("b5f28b67-41d8-4c88-9f84-13acbc4c6f16")


def build_temporal_findings(
    *,
    analysis_id: UUID,
    variable_code: str,
    unit: str,
    assessments: list[TemporalAssessment],
    source_observation_ids_by_date: dict[date, list[UUID] | tuple[UUID, ...]],
    method_version: str = "robust_calendar_mad_v1",
) -> list[AnomalyFinding]:
    """Serialize temporal assessments without interpreting them biologically.

    Finding IDs are stable for a given analysis, variable and date. Source
    observation IDs are supplied by the caller so lineage is never guessed.
    """
    if not variable_code or not unit or not method_version:
        raise ValueError("variable_code, unit and method_version are required")

    findings: list[AnomalyFinding] = []
    seen_dates: set[date] = set()
    for item in assessments:
        if item.observed_date in seen_dates:
            raise ValueError("temporal assessments must contain unique dates")
        seen_dates.add(item.observed_date)
        source_ids = list(source_observation_ids_by_date.get(item.observed_date, ()))
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("source observation IDs must be unique per finding")
        finding_id = uuid5(
            _TEMPORAL_FINDING_NAMESPACE,
            f"{analysis_id}:{variable_code}:{item.observed_date.isoformat()}",
        )
        findings.append(
            AnomalyFinding(
                finding_id=finding_id,
                variable_code=variable_code,
                unit=unit,
                observed_date=item.observed_date,
                observed_value=item.evaluated_value,
                status=item.status,
                baseline_median=item.baseline_median,
                baseline_mad=item.baseline_mad,
                robust_z_score=item.robust_z_score,
                history_count=item.history_count,
                coverage_ratio=item.coverage_ratio,
                flags=list(item.flags),
                method=IndicatorMethod(
                    name="robust_calendar_mad_screening",
                    version=method_version,
                ),
                source_observation_ids=source_ids,
            )
        )
    return findings
