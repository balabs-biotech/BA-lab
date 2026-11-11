"""Fail-closed resolution of explicit, versioned biological recommendations."""

from uuid import UUID, uuid5

from .models import (
    DomainInterpretation,
    DomainProfile,
    RecommendationProposal,
    RecommendationResolution,
)

_RECOMMENDATION_NAMESPACE = UUID("76b8cb3e-ffcb-4f92-9bd6-c05b8a2e0c1f")


def resolve_recommendations(
    interpretation: DomainInterpretation,
    profile: DomainProfile,
) -> RecommendationResolution:
    """Resolve recommendations only from exact profile-matched signals.

    This function never creates thresholds, executes controls, or infers an
    action from a finding. Missing definitions and unmet/contraindicated
    context fail closed into a withheld proposal with explicit reasons.
    """
    if (
        interpretation.profile_id != profile.profile_id
        or interpretation.profile_version != profile.version
        or interpretation.module != profile.module
    ):
        raise ValueError("interpretation and recommendation profile must match")

    definitions = {
        definition.recommendation_code: definition
        for definition in profile.recommendations
    }
    proposals: list[RecommendationProposal] = []

    for signal in interpretation.signals:
        code = signal.recommendation_code
        if code is None:
            continue

        definition = definitions.get(code)
        reasons: list[str] = []
        if signal.profile_id != profile.profile_id:
            reasons.append("signal_profile_mismatch")
        if signal.profile_version != profile.version:
            reasons.append("signal_profile_version_mismatch")
        if signal.module != profile.module:
            reasons.append("signal_module_mismatch")

        if definition is None:
            reasons.append("recommendation_definition_missing")
            instruction_code = None
            rationale_code = None
        else:
            instruction_code = definition.instruction_code
            rationale_code = definition.rationale_code
            if signal.signal_code not in definition.applicable_signal_codes:
                reasons.append("signal_code_not_applicable")
            if signal.finding_status not in definition.allowed_finding_statuses:
                reasons.append(f"finding_status_not_allowed:{signal.finding_status}")
            for tag in sorted(definition.required_context_tags - signal.context_tags):
                reasons.append(f"required_context_missing:{tag}")
            for tag in sorted(definition.contraindicated_context_tags & signal.context_tags):
                reasons.append(f"contraindicated_context:{tag}")

        proposal_id = uuid5(
            _RECOMMENDATION_NAMESPACE,
            f"{signal.signal_id}:{profile.profile_id}:{profile.version}:{code}",
        )
        proposals.append(RecommendationProposal(
            recommendation_id=proposal_id,
            recommendation_code=code,
            profile_id=profile.profile_id,
            profile_version=profile.version,
            module=profile.module,
            source_signal_id=signal.signal_id,
            source_analysis_id=signal.source_analysis_id,
            source_finding_id=signal.source_finding_id,
            instruction_code=instruction_code,
            rationale_code=rationale_code,
            status="withheld" if reasons else "proposed",
            withholding_reasons=tuple(reasons),
        ))

    proposed_count = sum(item.status == "proposed" for item in proposals)
    return RecommendationResolution(
        profile_id=profile.profile_id,
        profile_version=profile.version,
        module=profile.module,
        proposals=tuple(proposals),
        proposed_count=proposed_count,
        withheld_count=len(proposals) - proposed_count,
    )
