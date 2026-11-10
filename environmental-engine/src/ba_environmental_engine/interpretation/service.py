"""Apply explicit domain rules to traceable BAL-JSON findings."""

from uuid import UUID, uuid5

from ba_environmental_engine.contracts.bal_json import BALAnalysis
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
                f"{finding.finding_id}:{rule.rule_id}",
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
                    source_observation_ids=tuple(finding.source_observation_ids),
                    variable_code=finding.variable_code,
                    observed_date=finding.observed_date.isoformat(),
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
