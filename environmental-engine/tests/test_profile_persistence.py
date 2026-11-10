from uuid import uuid4

import pytest

from ba_environmental_engine.contexts.biological import BiologicalDomain
from ba_environmental_engine.contexts.environment import EnvironmentType, ObservationOrigin
from ba_environmental_engine.contexts.profile_persistence import (
    SupabaseEnvironmentalProfileRepository,
    domain_profile_from_record,
    environment_context_from_record,
)


def make_environment_profile(**overrides):
    record = {
        "id": str(uuid4()),
        "organization_id": str(uuid4()),
        "environment_id": str(uuid4()),
        "profile_code": "fruiting-room",
        "profile_version": "1.2.0",
        "context_type": "fruiting_chamber",
        "label": "Pleurotus fruiting room",
        "timezone": "Africa/Algiers",
        "origin": "sensor",
        "status": "active",
        "valid_from": "2026-10-01",
        "valid_to": None,
        "environment": {"location_id": str(uuid4())},
        "sensors": [{"sensor_id": str(uuid4())}],
    }
    record.update(overrides)
    return record


def make_domain_profile(**overrides):
    record = {
        "id": str(uuid4()),
        "organization_id": str(uuid4()),
        "domain": "mycology",
        "profile_code": "mycology-base",
        "profile_version": "1.0.0",
        "status": "active",
        "valid_from": "2026-10-01",
        "valid_to": None,
        "rules": [
            {
                "rule_id": "vpd-suspect",
                "variable_code": "vpd_kpa",
                "finding_status": "suspect",
                "required_context_tags": ["stage:fruiting"],
                "signal_code": "vpd_suspect",
                "severity": "moderate",
                "message_code": "vpd_suspect",
                "recommendation_code": None,
            }
        ],
    }
    record.update(overrides)
    return record


def test_environment_profile_record_builds_engine_context():
    record = make_environment_profile()
    context = environment_context_from_record(record)

    assert str(context.context_id) == record["environment_id"]
    assert str(context.organization_id) == record["organization_id"]
    assert str(context.location_id) == record["environment"]["location_id"]
    assert context.context_type is EnvironmentType.FRUITING_CHAMBER
    assert context.origin is ObservationOrigin.SENSOR
    assert [str(sensor_id) for sensor_id in context.sensor_ids] == [record["sensors"][0]["sensor_id"]]
    assert context.profile_code == "fruiting-room"
    assert context.profile_version == "1.2.0"


def test_environment_profile_requires_joined_physical_location():
    record = make_environment_profile(environment={"location_id": None})
    with pytest.raises(ValueError, match="physical location"):
        environment_context_from_record(record)


def test_environment_profile_rejects_sensor_origin_without_sensor_bindings():
    record = make_environment_profile(sensors=[])
    with pytest.raises(ValueError, match="at least one sensor"):
        environment_context_from_record(record)


def test_domain_profile_record_builds_typed_rules():
    record = make_domain_profile()
    profile = domain_profile_from_record(record)

    assert profile.profile_id == "mycology-base"
    assert profile.module == "mycology"
    assert profile.version == "1.0.0"
    assert len(profile.rules) == 1
    assert profile.rules[0].rule_id == "vpd-suspect"
    assert profile.rules[0].required_context_tags == frozenset({"stage:fruiting"})


def test_domain_profile_rejects_duplicate_rule_ids():
    record = make_domain_profile()
    record["rules"] = [record["rules"][0], record["rules"][0]]
    with pytest.raises(ValueError, match="unique"):
        domain_profile_from_record(record)


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
        self.filters.append((key, "eq", value))
        return self

    def lte(self, key, value):
        self.filters.append((key, "lte", value))
        return self

    def in_(self, key, values):
        self.filters.append((key, "in", values))
        return self

    def or_(self, expression):
        self.operations.append(("or", expression))
        return self

    def order(self, key, desc=False):
        self.operations.append(("order", key, desc))
        return self

    def execute(self):
        return FakeResponse(self.data)


class FakeSupabase:
    def __init__(self, responses):
        self.responses = responses
        self.queries = []

    def table(self, name):
        query = FakeQuery(self.responses[name])
        self.queries.append((name, query))
        return query


def test_repository_resolves_environment_profile_for_full_analysis_window():
    record = make_environment_profile()
    client = FakeSupabase({"environment_context_profiles": [record]})
    repository = SupabaseEnvironmentalProfileRepository(client)

    context = repository.get_environment_profile_for_scope(
        organization_id=record["organization_id"],
        environment_id=record["environment_id"],
        from_date="2026-11-01",
        to_date="2026-11-30",
    )

    assert str(context.context_id) == record["environment_id"]
    query = client.queries[0][1]
    assert ("organization_id", "eq", record["organization_id"]) in query.filters
    assert ("environment_id", "eq", record["environment_id"]) in query.filters
    assert ("status", "in", ["active", "retired"]) in query.filters
    assert ("valid_from", "lte", "2026-11-01") in query.filters
    assert ("or", "valid_to.is.null,valid_to.gte.2026-11-30") in query.operations
    select = next(op[1] for op in query.operations if op[0] == "select")
    assert "environment_context_profiles_environment_fk" in select
    assert "environment_context_profile_sensors_profile_fk" in select


def test_repository_resolves_domain_profile_by_tenant_domain_and_full_window():
    record = make_domain_profile()
    client = FakeSupabase({"domain_interpretation_profiles": [record]})
    repository = SupabaseEnvironmentalProfileRepository(client)

    profile = repository.get_domain_profile_for_scope(
        organization_id=record["organization_id"],
        domain=BiologicalDomain.MYCOLOGY,
        from_date="2026-11-01",
        to_date="2026-11-30",
    )

    assert profile.profile_id == record["profile_code"]
    query = client.queries[0][1]
    assert ("organization_id", "eq", record["organization_id"]) in query.filters
    assert ("domain", "eq", "mycology") in query.filters
    assert ("status", "in", ["active", "retired"]) in query.filters
    assert ("valid_from", "lte", "2026-11-01") in query.filters
    assert ("or", "valid_to.is.null,valid_to.gte.2026-11-30") in query.operations


@pytest.mark.parametrize(
    "method,table,kwargs",
    [
        (
            "get_environment_profile_for_scope",
            "environment_context_profiles",
            {"environment_id": str(uuid4())},
        ),
        (
            "get_domain_profile_for_scope",
            "domain_interpretation_profiles",
            {"domain": BiologicalDomain.LAB},
        ),
    ],
)
def test_repository_rejects_missing_profile(method, table, kwargs):
    client = FakeSupabase({table: []})
    repository = SupabaseEnvironmentalProfileRepository(client)
    with pytest.raises(LookupError, match="no versioned profile"):
        getattr(repository, method)(
            organization_id=str(uuid4()),
            from_date="2026-11-01",
            to_date="2026-11-30",
            **kwargs,
        )


def test_repository_rejects_ambiguous_profiles():
    first = make_domain_profile()
    second = make_domain_profile(
        id=str(uuid4()),
        organization_id=first["organization_id"],
        profile_code="mycology-alt",
    )
    client = FakeSupabase({"domain_interpretation_profiles": [first, second]})
    repository = SupabaseEnvironmentalProfileRepository(client)

    with pytest.raises(ValueError, match="multiple versioned profiles"):
        repository.get_domain_profile_for_scope(
            organization_id=first["organization_id"],
            domain=BiologicalDomain.MYCOLOGY,
            from_date="2026-11-01",
            to_date="2026-11-30",
        )


def test_repository_rejects_reversed_date_window():
    client = FakeSupabase({"environment_context_profiles": []})
    repository = SupabaseEnvironmentalProfileRepository(client)
    with pytest.raises(ValueError, match="on or after"):
        repository.get_environment_profile_for_scope(
            organization_id=str(uuid4()),
            environment_id=str(uuid4()),
            from_date="2026-11-30",
            to_date="2026-11-01",
        )
