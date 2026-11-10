from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from ba_environmental_engine.contexts.biological import BiologicalContext, BiologicalDomain
from ba_environmental_engine.contexts.environment import EnvironmentContext, EnvironmentType, ObservationOrigin
from ba_environmental_engine.execution import run_environmental_analysis
from ba_environmental_engine.interpretation import (
    interpret_findings,
    interpret_analysis_for_biological_context,
    interpret_persisted_analysis_for_subject,
)
from ba_environmental_engine.interpretation.models import (
    DomainProfile,
    InterpretationRule,
)
from ba_environmental_engine.sources.models import NormalizedEnvironmentalObservation


def make_analysis():
    organization_id, location_id = uuid4(), uuid4()
    rows = []
    start = date(2026, 10, 25)
    for offset in range(8):
        day = start + timedelta(days=offset)
        observed_at = datetime(day.year, day.month, day.day, 12, tzinfo=timezone.utc)
        for variable, value, unit in (
            ("air_temperature_mean", 80.0 if offset == 7 else 20.0, "degC"),
            ("air_temperature_max", 25.0, "degC"),
            ("air_temperature_min", 15.0, "degC"),
            ("wind_speed_mean", 2.0, "m/s"),
            ("solar_radiation_all_sky", 20.0, "MJ/m2"),
            ("relative_humidity_mean", 60.0, "%"),
        ):
            rows.append(
                NormalizedEnvironmentalObservation(
                    source_observation_id=uuid4(),
                    organization_id=organization_id,
                    location_id=location_id,
                    data_family="weather",
                    provider_code="NASA_POWER",
                    dataset_code="POWER_DAILY_AGRO",
                    source_parameter=variable,
                    variable_code=variable,
                    value=value,
                    unit=unit,
                    source_value=value,
                    source_unit=unit,
                    observed_at=observed_at,
                    observed_date=day,
                    retrieved_at=observed_at + timedelta(hours=2),
                    spatial_resolution_m=55000.0,
                    quality_flag=None,
                    source_url="https://power.larc.nasa.gov/",
                    source_time_standard="NASA POWER daily local solar time",
                    source_metadata={},
                )
            )
    return run_environmental_analysis(
        observations=rows,
        analysis_id=uuid4(),
        generated_at=datetime(2026, 11, 3, tzinfo=timezone.utc),
        engine_version="0.1.0",
        scope_from=start,
        scope_to=start + timedelta(days=7),
        latitude_deg=36.19,
        altitude_m=1000.0,
        temporal_variables=("air_temperature_mean",),
        temporal_window=7,
        temporal_minimum_history=7,
        temporal_minimum_coverage=1.0,
    )


def test_domain_profile_routes_only_explicitly_configured_findings():
    analysis = make_analysis()
    profile = DomainProfile(
        profile_id="mycology-fruiting-v1",
        module="mycology",
        version="1.0.0",
        rules=(
            InterpretationRule(
                rule_id="temperature-review",
                variable_code="air_temperature_mean",
                finding_status="suspect",
                required_context_tags=frozenset({"stage:fruiting"}),
                signal_code="environmental_review",
                severity="high",
                message_code="temperature_deviation_review",
            ),
        ),
    )

    result = interpret_findings(
        analysis,
        profile,
        context_tags=frozenset({"stage:fruiting"}),
    )

    assert result.module == "mycology"
    assert result.evaluated_findings == 8
    assert result.matched_findings == 1
    signal = result.signals[0]
    assert signal.finding_status == "suspect"
    assert signal.variable_code == "air_temperature_mean"
    assert signal.source_analysis_id == analysis.analysis_id
    assert len(signal.source_observation_ids) == 1
    assert signal.recommendation_code is None


def test_domain_profile_requires_context_and_does_not_invent_recommendations():
    analysis = make_analysis()
    profile = DomainProfile(
        profile_id="greentech-context-v1",
        module="greentech",
        version="1.0.0",
        rules=(
            InterpretationRule(
                rule_id="heat-review",
                variable_code="air_temperature_mean",
                finding_status="suspect",
                required_context_tags=frozenset({"crop:tomato", "stage:fruiting"}),
                signal_code="review",
                severity="moderate",
                message_code="review_environmental_deviation",
            ),
        ),
    )

    result = interpret_findings(analysis, profile, context_tags=frozenset({"crop:tomato"}))

    assert result.signals == ()
    assert result.matched_findings == 0


def test_domain_profile_ids_are_stable_for_same_inputs():
    analysis = make_analysis()
    profile = DomainProfile(
        profile_id="lab-v1",
        module="lab",
        version="1.0.0",
        rules=(
            InterpretationRule(
                rule_id="temperature-alert",
                variable_code="air_temperature_mean",
                finding_status="suspect",
                signal_code="review",
                severity="high",
                message_code="review_temperature",
            ),
        ),
    )

    first = interpret_findings(analysis, profile)
    second = interpret_findings(analysis, profile)

    assert first.signals[0].signal_id == second.signals[0].signal_id

    other_context = interpret_findings(
        analysis,
        profile,
        biological_context_id=uuid4(),
    )
    assert first.signals[0].signal_id != other_context.signals[0].signal_id



def test_biological_context_is_bound_to_environment_and_enriches_domain_rules():
    analysis = make_analysis()
    environment = EnvironmentContext(
        context_id=uuid4(),
        organization_id=analysis.scope.organization_id,
        location_id=analysis.scope.location_id,
        context_type=EnvironmentType.FRUITING_CHAMBER,
        label="Chambre Pleurotus",
        timezone="Africa/Algiers",
        origin=ObservationOrigin.SENSOR,
        sensor_ids=[uuid4()],
        profile_code="ba_fruiting_room",
        profile_version="1.0.0",
    )
    biological = BiologicalContext(
        context_id=uuid4(),
        subject_id=uuid4(),
        organization_id=analysis.scope.organization_id,
        location_id=analysis.scope.location_id,
        environment_context_id=environment.context_id,
        domain="mycology",
        organism_kind="fungus",
        taxon_code="pleurotus_ostreatus",
        strain_code="BA-P80",
        culture_stage="fruiting",
        substrate_code="wheat_straw",
        production_system="fruiting_chamber",
        context_tags=frozenset({"season:winter"}),
        valid_from=analysis.scope.from_date,
        valid_to=analysis.scope.to_date,
    )
    profile = DomainProfile(
        profile_id="mycology-pleurotus-v1",
        module="mycology",
        version="1.0.0",
        rules=(
            InterpretationRule(
                rule_id="fruiting-temperature-review",
                variable_code="air_temperature_mean",
                finding_status="suspect",
                required_context_tags=frozenset({
                    "stage:fruiting",
                    "strain:BA-P80",
                    "substrate:wheat_straw",
                    "system:fruiting_chamber",
                }),
                signal_code="environmental_review",
                severity="high",
                message_code="review_fruiting_temperature",
            ),
        ),
    )

    result = interpret_analysis_for_biological_context(
        analysis,
        profile,
        biological,
        environment,
    )

    assert result.matched_findings == 1
    assert result.signals[0].biological_context_id == biological.context_id
    assert result.signals[0].biological_subject_id == biological.subject_id
    assert result.signals[0].environment_context_id == environment.context_id
    assert result.signals[0].context_tags >= {
        "season:winter",
        "stage:fruiting",
        "strain:BA-P80",
        "substrate:wheat_straw",
        "system:fruiting_chamber",
    }


def test_biological_context_cannot_be_interpreted_by_another_domain_profile():
    analysis = make_analysis()
    environment = EnvironmentContext(
        context_id=uuid4(),
        organization_id=analysis.scope.organization_id,
        location_id=analysis.scope.location_id,
        context_type=EnvironmentType.FRUITING_CHAMBER,
        label="Chambre Pleurotus",
        timezone="Africa/Algiers",
        origin=ObservationOrigin.SENSOR,
        sensor_ids=[uuid4()],
        profile_code="ba_fruiting_room",
        profile_version="1.0.0",
    )
    biological = BiologicalContext(
        context_id=uuid4(),
        subject_id=uuid4(),
        organization_id=analysis.scope.organization_id,
        location_id=analysis.scope.location_id,
        environment_context_id=environment.context_id,
        domain="mycology",
        organism_kind="fungus",
        taxon_code="pleurotus_ostreatus",
        strain_code="BA-P80",
        culture_stage="fruiting",
        production_system="fruiting_chamber",
        valid_from=analysis.scope.from_date,
    )
    profile = DomainProfile(
        profile_id="greentech-v1",
        module="greentech",
        version="1.0.0",
        rules=(),
    )

    import pytest
    with pytest.raises(ValueError, match="profile module must match biological context domain"):
        interpret_analysis_for_biological_context(analysis, profile, biological, environment)


class InMemoryBiologicalContextRepository:
    def __init__(self, contexts):
        self.contexts = tuple(contexts)
        self.last_query = None

    def list_for_subject(
        self, *, organization_id, domain, subject_id, on_date=None
    ):
        self.last_query = (organization_id, domain, subject_id)
        return tuple(
            context
            for context in self.contexts
            if str(context.organization_id) == organization_id
            and context.domain == domain
            and str(context.subject_id) == subject_id
        )


def make_persisted_context_for_analysis(analysis, *, valid_from=None, valid_to=None):
    environment = EnvironmentContext(
        context_id=uuid4(),
        organization_id=analysis.scope.organization_id,
        location_id=analysis.scope.location_id,
        context_type=EnvironmentType.FRUITING_CHAMBER,
        label="Chambre Pleurotus",
        timezone="Africa/Algiers",
        origin=ObservationOrigin.SENSOR,
        sensor_ids=[uuid4()],
        profile_code="ba_fruiting_room",
        profile_version="1.0.0",
    )
    context = BiologicalContext(
        context_id=uuid4(),
        subject_id=uuid4(),
        organization_id=analysis.scope.organization_id,
        location_id=analysis.scope.location_id,
        environment_context_id=environment.context_id,
        domain="mycology",
        organism_kind="fungus",
        taxon_code="pleurotus_ostreatus",
        strain_code="BA-P80",
        culture_stage="fruiting",
        substrate_code="wheat_straw",
        production_system="fruiting_chamber",
        context_tags=frozenset({"season:winter"}),
        valid_from=valid_from or analysis.scope.from_date,
        valid_to=valid_to if valid_to is not None else analysis.scope.to_date,
    )
    return context, environment


def test_persisted_context_repository_is_connected_to_interpretation():
    analysis = make_analysis()
    context, environment = make_persisted_context_for_analysis(analysis)
    repository = InMemoryBiologicalContextRepository([context])
    profile = DomainProfile(
        profile_id="mycology-persisted-v1",
        module="mycology",
        version="1.0.0",
        rules=(),
    )

    result = interpret_persisted_analysis_for_subject(
        analysis,
        profile,
        repository,
        environment,
        subject_id=context.subject_id,
    )

    assert result.module == "mycology"
    assert result.evaluated_findings == len(analysis.findings)
    assert repository.last_query == (
        str(analysis.scope.organization_id),
        BiologicalDomain.MYCOLOGY,
        str(context.subject_id),
    )


def test_persisted_interpretation_rejects_context_covering_only_part_of_scope():
    import pytest

    analysis = make_analysis()
    context, environment = make_persisted_context_for_analysis(
        analysis,
        valid_from=analysis.scope.from_date + timedelta(days=1),
    )
    repository = InMemoryBiologicalContextRepository([context])
    profile = DomainProfile(
        profile_id="mycology-persisted-v1",
        module="mycology",
        version="1.0.0",
        rules=(),
    )

    with pytest.raises(ValueError, match="cover the complete analysis scope"):
        interpret_persisted_analysis_for_subject(
            analysis, profile, repository, environment, subject_id=context.subject_id
        )


def test_persisted_interpretation_rejects_multiple_overlapping_contexts():
    import pytest

    analysis = make_analysis()
    context, environment = make_persisted_context_for_analysis(analysis)
    other = context.model_copy(update={"context_id": uuid4()})
    repository = InMemoryBiologicalContextRepository([context, other])
    profile = DomainProfile(
        profile_id="mycology-persisted-v1",
        module="mycology",
        version="1.0.0",
        rules=(),
    )

    with pytest.raises(ValueError, match="multiple persisted biological contexts"):
        interpret_persisted_analysis_for_subject(
            analysis, profile, repository, environment, subject_id=context.subject_id
        )


def test_persisted_interpretation_fails_when_context_is_missing():
    import pytest

    analysis = make_analysis()
    context, environment = make_persisted_context_for_analysis(analysis)
    repository = InMemoryBiologicalContextRepository([])
    profile = DomainProfile(
        profile_id="mycology-persisted-v1",
        module="mycology",
        version="1.0.0",
        rules=(),
    )

    with pytest.raises(LookupError, match="no persisted biological context"):
        interpret_persisted_analysis_for_subject(
            analysis, profile, repository, environment, subject_id=context.subject_id
        )
