from datetime import date
from uuid import uuid4

import pytest

from ba_environmental_engine.contexts.biological import (
    BiologicalContext,
    BiologicalDomain,
    OrganismKind,
    validate_biological_context_for_analysis,
)
from ba_environmental_engine.contexts.environment import (
    EnvironmentContext,
    EnvironmentType,
    ObservationOrigin,
)
from ba_environmental_engine.contracts.bal_json import AnalysisScope


def make_environment():
    organization_id, location_id = uuid4(), uuid4()
    environment = EnvironmentContext(
        context_id=uuid4(),
        organization_id=organization_id,
        location_id=location_id,
        context_type=EnvironmentType.FRUITING_CHAMBER,
        label="Chambre de fructification",
        timezone="Africa/Algiers",
        origin=ObservationOrigin.SENSOR,
        sensor_ids=[uuid4()],
        profile_code="ba_fruiting_room",
        profile_version="1.0.0",
    )
    return organization_id, location_id, environment


def make_biological_context(environment, organization_id, location_id):
    return BiologicalContext(
        context_id=uuid4(),
        subject_id=uuid4(),
        organization_id=organization_id,
        location_id=location_id,
        environment_context_id=environment.context_id,
        domain="mycology",
        organism_kind=OrganismKind.FUNGUS,
        taxon_code="pleurotus_ostreatus",
        strain_code="BA-P80",
        cultivar_code=None,
        culture_stage="fruiting",
        substrate_code="wheat_straw",
        production_system="fruiting_chamber",
        context_tags=frozenset({"season:winter", "batch:BA-001"}),
        valid_from=date(2026, 10, 1),
        valid_to=date(2026, 12, 31),
    )


def test_biological_context_binds_strain_stage_and_environment_to_analysis_scope():
    organization_id, location_id, environment = make_environment()
    context = make_biological_context(environment, organization_id, location_id)
    scope = AnalysisScope(
        organization_id=organization_id,
        location_id=location_id,
        **{"from": date(2026, 11, 1), "to": date(2026, 11, 10)},
    )

    validated = validate_biological_context_for_analysis(context, environment, scope)

    assert validated.context_id == context.context_id
    assert validated.environment_context_id == environment.context_id
    assert validated.strain_code == "BA-P80"
    assert validated.culture_stage == "fruiting"


def test_biological_context_rejects_cross_tenant_environment_binding():
    organization_id, location_id, environment = make_environment()
    context = make_biological_context(environment, organization_id, location_id)
    foreign_environment = environment.model_copy(update={"organization_id": uuid4()})
    scope = AnalysisScope(
        organization_id=organization_id,
        location_id=location_id,
        **{"from": date(2026, 11, 1), "to": date(2026, 11, 10)},
    )

    with pytest.raises(ValueError, match="organization and location"):
        validate_biological_context_for_analysis(context, foreign_environment, scope)


def test_biological_context_rejects_analysis_outside_context_validity():
    organization_id, location_id, environment = make_environment()
    context = make_biological_context(environment, organization_id, location_id)
    scope = AnalysisScope(
        organization_id=organization_id,
        location_id=location_id,
        **{"from": date(2027, 1, 1), "to": date(2027, 1, 10)},
    )

    with pytest.raises(ValueError, match="does not overlap"):
        validate_biological_context_for_analysis(context, environment, scope)


def test_biological_context_rejects_strain_for_plant_context():
    organization_id, location_id, environment = make_environment()

    with pytest.raises(ValueError, match="strain_code is only valid"):
        BiologicalContext(
            context_id=uuid4(),
            subject_id=uuid4(),
            organization_id=organization_id,
            location_id=location_id,
            environment_context_id=environment.context_id,
            domain="greentech",
            organism_kind=OrganismKind.PLANT,
            taxon_code="solanum_lycopersicum",
            strain_code="BA-P80",
            culture_stage="vegetative",
            production_system="greenhouse",
            valid_from=date(2026, 10, 1),
        )
