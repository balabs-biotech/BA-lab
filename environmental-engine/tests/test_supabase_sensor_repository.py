from datetime import date
from uuid import uuid4

from ba_environmental_engine.sources.supabase_sensor import (
    SupabaseSensorMeasurementRepository,
)


class Response:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, table, responses):
        self.table_name = table
        self.responses = responses
        self.filters = []
        self.operations = []

    def select(self, value):
        self.operations.append(("select", value))
        return self

    def eq(self, key, value):
        self.filters.append((key, "eq", value))
        return self

    def in_(self, key, values):
        self.filters.append((key, "in", values))
        return self

    def lte(self, key, value):
        self.filters.append((key, "lte", value))
        return self

    def gte(self, key, value):
        self.filters.append((key, "gte", value))
        return self

    def lt(self, key, value):
        self.filters.append((key, "lt", value))
        return self

    def or_(self, expression):
        self.operations.append(("or", expression))
        return self

    def order(self, key, desc=False):
        self.operations.append(("order", key, desc))
        return self

    def execute(self):
        return Response(self.responses[self.table_name])


class Client:
    def __init__(self, responses):
        self.responses = responses
        self.queries = []

    def table(self, name):
        query = Query(name, self.responses)
        self.queries.append(query)
        return query


def make_records():
    organization_id = str(uuid4())
    environment_id = str(uuid4())
    device_id = str(uuid4())
    observation_id = str(uuid4())
    location_id = str(uuid4())
    profile = {
        "id": str(uuid4()),
        "organization_id": organization_id,
        "environment_id": environment_id,
        "profile_code": "fruiting-room",
        "profile_version": "1.0.0",
        "context_type": "fruiting_chamber",
        "label": "Fruiting room",
        "timezone": "Africa/Algiers",
        "origin": "sensor",
        "valid_from": "2026-01-01",
        "valid_to": None,
        "status": "active",
        "environment": {"location_id": location_id},
        "sensors": [{"sensor_id": device_id}],
    }
    measurement = {
        "id": observation_id,
        "organization_id": organization_id,
        "variable_code": "temperature",
        "raw_value": 22.0,
        "raw_unit_code": "degC",
        "normalized_value": None,
        "normalized_unit_code": None,
        "measured_at": "2026-11-10T09:00:00+00:00",
        "method": "iot_sensor",
        "instrument": "ESP32",
        "quality_state": "raw",
        "exclusion_reason": None,
        "environment_id": environment_id,
        "iot_device_id": device_id,
        "metadata": {"source": "iot"},
        "device": {
            "id": device_id,
            "organization_id": organization_id,
            "environment_id": environment_id,
            "device_code": "BA-ESP32-01",
            "device_type": "esp32",
        },
        "environment": {
            "id": environment_id,
            "organization_id": organization_id,
            "location_id": location_id,
        },
        "variable": {"canonical_unit_code": "degC"},
    }
    return organization_id, environment_id, profile, measurement


def test_repository_loads_tenant_scoped_sensor_measurements():
    org, env, profile, measurement = make_records()
    client = Client({
        "environment_context_profiles": [profile],
        "measurements": [measurement],
    })
    repository = SupabaseSensorMeasurementRepository(client)
    result = repository.list_for_scope(
        organization_id=org,
        environment_id=env,
        from_date=date(2026, 11, 10),
        to_date=date(2026, 11, 10),
    )
    assert len(result) == 1
    assert result[0].measurement.value == 22.0
    assert result[0].measurement.context_id == measurement["environment_id"]
    profile_query, measurement_query = client.queries
    assert (("organization_id", "eq", org)) in profile_query.filters
    assert (("environment_id", "eq", env)) in profile_query.filters
    assert (("iot_device_id", "in", [measurement["iot_device_id"]])) in measurement_query.filters
    assert (("metadata->>source", "eq", "iot")) in measurement_query.filters
    assert any(op[0] == "select" and "measurements_org_iot_device_fk" in op[1]
               for op in measurement_query.operations)


def test_repository_rejects_profile_missing_or_outside_scope():
    org, env, profile, measurement = make_records()
    profile["valid_from"] = "2026-11-11"
    client = Client({
        "environment_context_profiles": [profile],
        "measurements": [measurement],
    })
    repository = SupabaseSensorMeasurementRepository(client)
    import pytest
    with pytest.raises(LookupError, match="no sensor environment profile"):
        repository.list_for_scope(
            organization_id=org,
            environment_id=env,
            from_date=date(2026, 11, 10),
            to_date=date(2026, 11, 10),
        )


def test_repository_queries_calendar_day_in_profile_timezone():
    org, env, profile, measurement = make_records()
    client = Client({
        "environment_context_profiles": [profile],
        "measurements": [measurement],
    })
    repository = SupabaseSensorMeasurementRepository(client)
    repository.list_for_scope(
        organization_id=org,
        environment_id=env,
        from_date=date(2026, 11, 10),
        to_date=date(2026, 11, 10),
    )
    measurement_query = client.queries[1]
    lower = next(item[2] for item in measurement_query.filters
                 if item[0] == "measured_at" and item[1] == "gte")
    upper = next(item[2] for item in measurement_query.filters
                 if item[0] == "measured_at" and item[1] == "lt")
    assert lower == "2026-11-09T23:00:00+00:00"
    assert upper == "2026-11-10T23:00:00+00:00"
