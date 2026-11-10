from uuid import uuid4

import pytest

from ba_environmental_engine.contexts.biological import (
    BiologicalContext,
    BiologicalDomain,
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
    assert str(context.context_id) == record["id"]
    assert str(context.organization_id) == record["organization_id"]
    assert str(context.environment_context_id) == record["environment_id"]
    assert str(context.location_id) == record["environment"]["location_id"]
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


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, data):
        self.data = data
        self.filters = []
        self.operations = []

    def select(self, value):
        self.operations.append(("select", value))
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def order(self, key, desc=False):
        self.operations.append(("order", key, desc))
        return self

    def insert(self, value):
        self.operations.append(("insert", value))
        return self

    def update(self, value):
        self.operations.append(("update", value))
        return self

    def maybe_single(self):
        self.operations.append(("maybe_single",))
        return self

    def single(self):
        self.operations.append(("single",))
        return self

    def execute(self):
        return FakeResponse(self.data)


class FakeSupabase:
    def __init__(self, data):
        self.data = data
        self.query = None

    def table(self, name):
        assert name == "biological_contexts"
        self.query = FakeQuery(self.data)
        return self.query


def test_repository_scopes_reads_by_tenant_and_subject_and_filters_validity():
    from ba_environmental_engine.contexts.persistence import (
        SupabaseBiologicalContextRepository,
    )

    record = make_record("greentech")
    client = FakeSupabase([record])
    repository = SupabaseBiologicalContextRepository(client)

    contexts = repository.list_for_subject(
        organization_id=record["organization_id"],
        domain=BiologicalDomain.GREENTECH,
        subject_id=record["plant_culture_id"],
        on_date="2026-11-10",
    )

    assert len(contexts) == 1
    assert ("organization_id", record["organization_id"]) in client.query.filters
    assert ("plant_culture_id", record["plant_culture_id"]) in client.query.filters
    assert ("domain", "greentech") in client.query.filters
    select = next(op[1] for op in client.query.operations if op[0] == "select")
    assert "biological_contexts_environment_fk" in select


def test_repository_update_never_allows_tenant_or_primary_key_reassignment():
    from ba_environmental_engine.contexts.persistence import (
        SupabaseBiologicalContextRepository,
    )

    record = make_record("mycology")
    client = FakeSupabase(record)
    repository = SupabaseBiologicalContextRepository(client)
    context = biological_context_from_record(record)

    repository.update(context)

    update_payload = next(
        op[1] for op in client.query.operations if op[0] == "update"
    )
    assert "organization_id" not in update_payload
    assert "id" not in update_payload
    assert ("organization_id", record["organization_id"]) in client.query.filters
    assert ("id", record["id"]) in client.query.filters


def test_repository_rejects_overlapping_contexts_instead_of_choosing_arbitrarily():
    from copy import deepcopy

    from ba_environmental_engine.contexts.persistence import (
        SupabaseBiologicalContextRepository,
    )

    first = make_record("mycology")
    second = deepcopy(first)
    second["id"] = str(uuid4())
    second["valid_from"] = "2026-11-01"
    second["valid_to"] = "2026-11-20"
    client = FakeSupabase([first, second])
    repository = SupabaseBiologicalContextRepository(client)

    with pytest.raises(ValueError, match="multiple biological contexts overlap"):
        repository.get_for_subject_on_date(
            organization_id=first["organization_id"],
            domain=BiologicalDomain.MYCOLOGY,
            subject_id=first["culture_id"],
            on_date="2026-11-10",
        )
