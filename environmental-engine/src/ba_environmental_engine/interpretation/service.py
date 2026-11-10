"""Apply explicit domain rules to traceable BAL-JSON findings."""

from uuid import UUID, uuid5

from ba_environmental_engine.contracts.bal_json import BALAnalysis
from ba_environmental_engine.contexts.biological import (
    BiologicalContext,
    validate_biological_context_for_analysis,
)
from ba_environmental_engine.contexts.environment import EnvironmentContext
from ba_environmental_engine.interpretation.models import (
    DomainInterpretation,
    DomainProfile,
    DomainSignal,
)

_DOMAIN_SIGNAL_NAMESPACE = UUID("d2c7a0bb-37a9-4dc1-98a7-3c7c05e80a6a")


def interpret_findings(
    analysis: BALAnalysis,
    profile: DomainProfile,
    *,
    context_tags: frozenset[str] = frozenset(),
    biological_context_id: UUID | None = None,
    biological_subject_id: UUID | None = None,
    environment_context_id: UUID | None = None,
) -> DomainInterpretation:
    """Evaluate findings against one explicitly supplied domain profile.

    A rule matches only when variable, finding status, and all required context
    tags match. No implicit thresholds, biological advice, or fallback rules
    are introduced. Findings without a matching rule remain unclassified.
    """
    signals: list[DomainSignal] = []
    for finding in analysis.findings:
        for rule in profile.rules:
            if finding.variable_code != rule.variable_code:
                continue
            if finding.status != rule.finding_status:
                continue
            if not rule.required_context_tags.issubset(context_tags):
                continue

            signal_id = uuid5(
                _DOMAIN_SIGNAL_NAMESPACE,
                f"{analysis.analysis_id}:{profile.profile_id}:{profile.version}:"
                f"{finding.finding_id}:{rule.rule_id}:{biological_context_id or 'none'}",
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
                    source_analysis_id=analysis.analysis_id,
                    source_finding_id=finding.finding_id,
                    biological_context_id=biological_context_id,
                    biological_subject_id=biological_subject_id,
                    environment_context_id=environment_context_id,
                    source_observation_ids=tuple(finding.source_observation_ids),
                    variable_code=finding.variable_code,
                    observed_date=finding.observed_date,
                    observed_value=finding.observed_value,
                    unit=finding.unit,
                    finding_status=finding.status,
                    context_tags=context_tags,
                )
            )

    return DomainInterpretation(
        profile_id=profile.profile_id,
        profile_version=profile.version,
        module=profile.module,
        signals=tuple(signals),
        evaluated_findings=len(analysis.findings),
        matched_findings=len({signal.source_finding_id for signal in signals}),
    )



def interpret_analysis_for_biological_context(
    analysis: BALAnalysis,
    profile: DomainProfile,
    biological_context: BiologicalContext,
    environment_context: EnvironmentContext,
) -> DomainInterpretation:
    """Interpret findings using an explicitly bound biological cultivation context.

    The context must match the analysis tenant, location, environment and time
    scope. Only declared biological metadata is promoted to rule-match tags.
    """
    if profile.module != biological_context.domain.value:
        raise ValueError("profile module must match biological context domain")

    validate_biological_context_for_analysis(
        biological_context,
        environment_context,
        analysis.scope,
    )

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

    return interpret_findings(
        analysis,
        profile,
        context_tags=frozenset(context_tags),
        biological_context_id=biological_context.context_id,
        biological_subject_id=biological_context.subject_id,
        environment_context_id=environment_context.context_id,
    )
