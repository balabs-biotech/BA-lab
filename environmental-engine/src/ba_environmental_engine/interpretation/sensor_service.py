"""Domain interpretation bridge for descriptive IoT sensor analyses.

This bridge deliberately does not invent biological thresholds. A sensor series is
classified only from explicit data-quality facts already produced by SensorEngine:
insufficient data, insufficient coverage, or normal availability.
"""
from __future__ import annotations

from datetime import date
from zoneinfo import ZoneInfo
from uuid import UUID, uuid5

from ba_environmental_engine.contexts.biological import BiologicalContext
from ba_environmental_engine.contexts.environment import EnvironmentContext, ObservationOrigin
from ba_environmental_engine.interpretation.models import (
    DomainInterpretation,
    DomainProfile,
    DomainSignal,
)
from ba_environmental_engine.sources.sensor_analysis import SensorAnalysis
from ba_environmental_engine.sources.sensor_temporal import SensorTemporalAssessment

_SENSOR_SIGNAL_NAMESPACE = UUID("f31c5e16-7d4d-4d1d-bf43-ff76d9eebd5a")


def _finding_status(summary) -> str:
    if summary.status != "ok":
        return "insufficient_history"
    if summary.availability_ratio is None:
        return "indeterminate"
    if summary.availability_ratio < 1.0:
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
    temporal_assessments: tuple[SensorTemporalAssessment, ...] = (),
    profile_timezone: str = "UTC",
    temporal_parameters: dict[str, int | float] | None = None,
) -> DomainInterpretation:
    """Route sensor-series and causal temporal findings through explicit domain rules.

    The temporal screen is statistical, not a biological threshold. A temporal
    assessment becomes a domain signal only when a persisted profile explicitly
    matches its variable, finding status, and biological context.
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

    # Temporal deviations are statistical findings, not biological diagnoses.
    # A signal is emitted only when the persisted domain profile explicitly
    # routes the assessment status for this variable and biological context.
    zone = ZoneInfo(profile_timezone)
    parameters = temporal_parameters or {}
    for assessment in temporal_assessments:
        if assessment.status in ("normal", "insufficient_history"):
            continue
        for rule in profile.rules:
            if rule.variable_code != assessment.variable_code:
                continue
            if rule.finding_status != assessment.status:
                continue
            if not rule.required_context_tags.issubset(context_tags):
                continue

            source_finding_id = uuid5(
                _SENSOR_SIGNAL_NAMESPACE,
                f"{source_analysis_id}:temporal:{assessment.observation_id}:"
                f"{assessment.variable_code}:{assessment.status}",
            )
            signal_id = uuid5(
                _SENSOR_SIGNAL_NAMESPACE,
                f"{source_finding_id}:{profile.profile_id}:{profile.version}:"
                f"{rule.rule_id}:{biological_context_id or 'none'}",
            )
            evidence = {
                "assessment_type": "causal_robust_temporal_screen",
                "sensor_id": str(assessment.sensor_id),
                "observed_at": assessment.observed_at.isoformat(),
                "flags": list(assessment.flags),
                "baseline_median": assessment.baseline_median,
                "baseline_mad": assessment.baseline_mad,
                "robust_z_score": assessment.robust_z_score,
                "history_count": assessment.history_count,
                **parameters,
            }
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
                    source_observation_ids=(assessment.observation_id,),
                    variable_code=assessment.variable_code,
                    observed_date=assessment.observed_at.astimezone(zone).date(),
                    observed_value=assessment.observed_value,
                    unit=assessment.unit_code,
                    finding_status=assessment.status,
                    context_tags=context_tags,
                    evidence=evidence,
                )
            )
            matched.add((source_finding_id, rule.rule_id))

    return DomainInterpretation(
        profile_id=profile.profile_id,
        profile_version=profile.version,
        module=profile.module,
        signals=tuple(signals),
        evaluated_findings=len(analysis.series) + len(temporal_assessments),
        matched_findings=len({signal.source_finding_id for signal in signals}),
    )



def interpret_sensor_analysis_for_biological_context(
    analysis: SensorAnalysis,
    profile: DomainProfile,
    biological_context: BiologicalContext,
    environment_context: EnvironmentContext,
    *,
    source_analysis_id: UUID,
    from_date: date,
    to_date: date,
    temporal_assessments: tuple[SensorTemporalAssessment, ...] = (),
    temporal_parameters: dict[str, int | float] | None = None,
) -> DomainInterpretation:
    """Validate persisted biological/environment bindings before sensor interpretation."""
    if profile.module != biological_context.domain.value:
        raise ValueError("domain profile module must match biological context domain")
    if environment_context.origin is not ObservationOrigin.SENSOR:
        raise ValueError("sensor interpretation requires a sensor-origin environment profile")
    if (
        biological_context.organization_id != environment_context.organization_id
        or biological_context.location_id != environment_context.location_id
        or biological_context.environment_context_id != environment_context.context_id
    ):
        raise ValueError("biological and sensor environment context bindings must match")
    if biological_context.valid_from > from_date or (
        biological_context.valid_to is not None and biological_context.valid_to < to_date
    ):
        raise ValueError("biological context must cover the complete sensor analysis scope")
    if to_date < from_date:
        raise ValueError("sensor analysis to_date must be on or after from_date")

    configured_sensor_ids = set(environment_context.sensor_ids)
    analyzed_sensor_ids = {series.sensor_id for series in analysis.series}
    if not analyzed_sensor_ids.issubset(configured_sensor_ids):
        raise ValueError("sensor analysis contains a device outside the resolved environment profile")
    assessment_sensor_ids = {item.sensor_id for item in temporal_assessments}
    if not assessment_sensor_ids.issubset(configured_sensor_ids):
        raise ValueError("temporal assessment contains a device outside the resolved environment profile")
    profile_zone = ZoneInfo(environment_context.timezone)
    if any(
        not from_date <= item.observed_at.astimezone(profile_zone).date() <= to_date
        for item in temporal_assessments
    ):
        raise ValueError("temporal assessment falls outside the biological context date scope")

    context_tags = set(biological_context.context_tags)
    context_tags.add(f"stage:{biological_context.culture_stage}")
    context_tags.add(f"organism:{biological_context.organism_kind.value}")
    context_tags.add(f"system:{biological_context.production_system}")
    if biological_context.taxon_code:
        context_tags.add(f"taxon:{biological_context.taxon_code}")
    if biological_context.strain_code:
        context_tags.add(f"strain:{biological_context.strain_code}")
    if biological_context.cultivar_code:
        context_tags.add(f"cultivar:{biological_context.cultivar_code}")
    if biological_context.substrate_code:
        context_tags.add(f"substrate:{biological_context.substrate_code}")

    return interpret_sensor_analysis(
        analysis,
        profile,
        source_analysis_id=source_analysis_id,
        observed_date=to_date,
        context_tags=frozenset(context_tags),
        biological_context_id=biological_context.context_id,
        biological_subject_id=biological_context.subject_id,
        environment_context_id=environment_context.context_id,
        temporal_assessments=temporal_assessments,
        profile_timezone=environment_context.timezone,
        temporal_parameters=temporal_parameters,
    )
