"""Domain interpretation bridge for descriptive IoT sensor analyses.

This bridge deliberately does not invent biological thresholds. A sensor series is
classified only from explicit data-quality facts already produced by SensorEngine:
insufficient data, insufficient coverage, or normal availability.
"""
from __future__ import annotations

from datetime import date
from uuid import UUID, uuid5

from ba_environmental_engine.interpretation.models import (
    DomainInterpretation,
    DomainProfile,
    DomainSignal,
)
from ba_environmental_engine.sources.sensor_analysis import SensorAnalysis

_SENSOR_SIGNAL_NAMESPACE = UUID("f31c5e16-7d4d-4d1d-bf43-ff76d9eebd5a")


def _finding_status(summary) -> str:
    if summary.status != "ok":
        return "insufficient_history"
    if summary.availability_ratio is not None and summary.availability_ratio < 1.0:
        return "insufficient_coverage"
    return "normal"


def interpret_sensor_analysis(
    analysis: SensorAnalysis,
    profile: DomainProfile,
    *,
    source_analysis_id: UUID,
    observed_date: date,
    context_tags: frozenset[str] = frozenset(),
    biological_context_id: UUID | None = None,
    biological_subject_id: UUID | None = None,
    environment_context_id: UUID | None = None,
) -> DomainInterpretation:
    """Apply explicit domain rules to quality-aware sensor series summaries.

    Numeric values are not compared against hidden thresholds. Rules can route
    normal or data-quality findings by variable and biological context. Future
    threshold/event detectors must remain separate and explicitly versioned.
    """
    signals: list[DomainSignal] = []
    matched: set[tuple[UUID, str]] = set()

    for summary in analysis.series:
        finding_status = _finding_status(summary)
        observed_value = summary.mean

        for rule in profile.rules:
            if rule.variable_code != summary.variable_code:
                continue
            if rule.finding_status != finding_status:
                continue
            if not rule.required_context_tags.issubset(context_tags):
                continue

            source_finding_id = uuid5(
                _SENSOR_SIGNAL_NAMESPACE,
                f"{source_analysis_id}:{summary.sensor_id}:{summary.variable_code}:"
                f"{finding_status}:{observed_date.isoformat()}",
            )
            signal_id = uuid5(
                _SENSOR_SIGNAL_NAMESPACE,
                f"{source_finding_id}:{profile.profile_id}:{profile.version}:"
                f"{rule.rule_id}:{biological_context_id or 'none'}",
            )
            signals.append(
                DomainSignal(
                    signal_id=signal_id,
                    profile_id=profile.profile_id,
                    profile_version=profile.version,
                    module=profile.module,
                    rule_id=rule.rule_id,
                    signal_code=rule.signal_code,
                    severity=rule.severity,
                    message_code=rule.message_code,
                    recommendation_code=rule.recommendation_code,
                    source_analysis_id=source_analysis_id,
                    source_finding_id=source_finding_id,
                    biological_context_id=biological_context_id,
                    biological_subject_id=biological_subject_id,
                    environment_context_id=environment_context_id,
                    source_observation_ids=summary.source_observation_ids,
                    variable_code=summary.variable_code,
                    observed_date=observed_date,
                    observed_value=observed_value,
                    unit=summary.unit_code,
                    finding_status=finding_status,
                    context_tags=context_tags,
                )
            )
            matched.add((source_finding_id, rule.rule_id))

    return DomainInterpretation(
        profile_id=profile.profile_id,
        profile_version=profile.version,
        module=profile.module,
        signals=tuple(signals),
        evaluated_findings=len(analysis.series),
        matched_findings=len({signal.source_finding_id for signal in signals}),
    )
