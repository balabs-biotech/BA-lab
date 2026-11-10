from datetime import date
from uuid import uuid4

import pytest

from ba_environmental_engine.contexts.biological import (
    BiologicalContext,
    BiologicalDomain,
    OrganismKind,
)
from ba_environmental_engine.contexts.persistence import (
    biological_context_from_record,
    biological_context_to_record,
)


def make_record(domain="mycology"):
    organization_id = uuid4()
    environment_id = uuid4()
    location_id = uuid4()
    culture_id = uuid4() if domain != "greentech" else None
    plant_culture_id = uuid4() if domain == "greentech" else None
    return {
        "id": str(uuid4()),
        "organization_id": str(organization_id),
        "domain": domain,
        "culture_id": str(culture_id) if culture_id else None,
        "plant_culture_id": str(plant_culture_id) if plant_culture_id else None,
        "environment_id": str(environment_id),
        "organism_kind": "plant" if domain == "greentech" else "fungus",
        "taxon_code": "solanum_lycopersicum" if domain == "greentech" else "pleurotus_ostreatus",
        "strain_code": None if domain == "greentech" else "BA-P80",
        "cultivar_code": "yellow_pear" if domain == "greentech" else None,
        "culture_stage": "vegetative" if domain == "greentech" else "fruiting",
        "substrate_code": "soil" if domain == "greentech" else "wheat_straw",
        "production_system": "greenhouse" if domain == "greentech" else "fruiting_chamber",
        "context_tags": ["season:winter", "trial:one"],
        "valid_from": "2026-10-01",
        "valid_to": "2026-12-31",
        "environment": {"location_id": str(location_id)},
    }


@pytest.mark.parametrize("domain", ["mycology", "lab", "greentech"])
def test_database_record_round_trips_to_biological_context(domain):
    record = make_record(domain)
    context = biological_context_from_record(record)

    assert isinstance(context, BiologicalContext)
    assert context.context_id == record["id"]
    assert context.organization_id == record["organization_id"]
    assert context.environment_context_id == record["environment_id"]
    assert context.location_id == record["environment"]["location_id"]
    assert context.domain.value == domain
    assert context.context_tags == frozenset(record["context_tags"])

    persisted = biological_context_to_record(context)
    assert persisted["id"] == record["id"]
    assert persisted["organization_id"] == record["organization_id"]
    assert persisted["environment_id"] == record["environment_id"]
    assert persisted["culture_id"] == record["culture_id"]
    assert persisted["plant_culture_id"] == record["plant_culture_id"]
    assert "location_id" not in persisted
    assert "subject_id" not in persisted


def test_database_record_rejects_ambiguous_subject_references():
    record = make_record()
    record["plant_culture_id"] = str(uuid4())

    with pytest.raises(ValueError, match="exactly one"):
        biological_context_from_record(record)


def test_database_record_requires_environment_location_for_analysis_binding():
    record = make_record()
    record["environment"] = {"location_id": None}

    with pytest.raises(ValueError, match="environment location"):
        biological_context_from_record(record)


def test_database_record_rejects_domain_subject_mismatch():
    record = make_record("greentech")
    record["culture_id"] = str(uuid4())
    record["plant_culture_id"] = None

    with pytest.raises(ValueError, match="does not match"):
        biological_context_from_record(record)
