"""Apply explicit domain rules to traceable BAL-JSON findings."""

from typing import Protocol
from uuid import UUID, uuid5

from ba_environmental_engine.contracts.bal_json import BALAnalysis
from ba_environmental_engine.contexts.biological import (
    BiologicalContext,
    BiologicalDomain,
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


class BiologicalContextRepository(Protocol):
    """Read-only repository surface required by persisted interpretation."""

    def list_overlapping_scope(
        self,
        *,
        organization_id: str,
        domain: BiologicalDomain,
        subject_id: str,
        from_date: str,
        to_date: str,
    ) -> tuple[BiologicalContext, ...]: ...


def _resolve_persisted_biological_context(
    analysis: BALAnalysis,
    repository: BiologicalContextRepository,
    *,
    domain: BiologicalDomain,
    subject_id: UUID,
) -> BiologicalContext:
    """Resolve one persisted biological context covering the complete analysis window."""
    overlapping = repository.list_overlapping_scope(
        organization_id=str(analysis.scope.organization_id),
        domain=domain,
        subject_id=str(subject_id),
        from_date=analysis.scope.from_date.isoformat(),
        to_date=analysis.scope.to_date.isoformat(),
    )
    if not overlapping:
        raise LookupError(
            "no persisted biological context overlaps the analysis scope"
        )
    if len(overlapping) > 1:
        raise ValueError(
            "multiple persisted biological contexts overlap the analysis scope"
        )

    context = overlapping[0]
    if (
        context.valid_from > analysis.scope.from_date
        or (
            context.valid_to is not None
            and context.valid_to < analysis.scope.to_date
        )
    ):
        raise ValueError(
            "one biological context must cover the complete analysis scope"
        )
    return context


def interpret_persisted_analysis_for_subject(
    analysis: BALAnalysis,
    profile: DomainProfile,
    repository: BiologicalContextRepository,
    environment_context: EnvironmentContext,
    *,
    subject_id: UUID,
) -> DomainInterpretation:
    """Interpret against one persisted biological context and supplied profiles."""
    context = _resolve_persisted_biological_context(
        analysis,
        repository,
        domain=BiologicalDomain(profile.module),
        subject_id=subject_id,
    )
    return interpret_analysis_for_biological_context(
        analysis,
        profile,
        context,
        environment_context,
    )


class EnvironmentalProfileRepository(Protocol):
    """Read-only profile resolver required by persisted interpretation."""

    def get_environment_profile_for_scope(
        self,
        *,
        organization_id: str,
        environment_id: str,
        from_date: str,
        to_date: str,
    ) -> EnvironmentContext: ...

    def get_domain_profile_for_scope(
        self,
        *,
        organization_id: str,
        domain: BiologicalDomain,
        from_date: str,
        to_date: str,
    ) -> DomainProfile: ...


def interpret_persisted_analysis_with_profiles(
    analysis: BALAnalysis,
    biological_repository: BiologicalContextRepository,
    profile_repository: EnvironmentalProfileRepository,
    *,
    domain: BiologicalDomain,
    subject_id: UUID,
) -> DomainInterpretation:
    """Resolve all persisted context/profile versions, then interpret one analysis.

    The requested domain only scopes the biological-context lookup. The resolved
    persisted context determines which domain profile is loaded; its environment
    reference determines the environment profile. The client cannot choose a
    profile version or submit a rule set.
    """
    context = _resolve_persisted_biological_context(
        analysis,
        biological_repository,
        domain=domain,
        subject_id=subject_id,
    )
    organization_id = str(analysis.scope.organization_id)
    from_date = analysis.scope.from_date.isoformat()
    to_date = analysis.scope.to_date.isoformat()

    environment_context = profile_repository.get_environment_profile_for_scope(
        organization_id=organization_id,
        environment_id=str(context.environment_context_id),
        from_date=from_date,
        to_date=to_date,
    )
    profile = profile_repository.get_domain_profile_for_scope(
        organization_id=organization_id,
        domain=context.domain,
        from_date=from_date,
        to_date=to_date,
    )

    return interpret_analysis_for_biological_context(
        analysis,
        profile,
        context,
        environment_context,
    )
