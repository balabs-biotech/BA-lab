from datetime import date, datetime, timezone
from uuid import uuid4

import pytest

from ba_environmental_engine.sources.supabase_satellite import (
    SupabaseSatelliteObservationRepository,
)


class Response:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, rows):
        self.rows = rows
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

    def gte(self, key, value):
        self.filters.append((key, "gte", value))
        return self

    def lt(self, key, value):
        self.filters.append((key, "lt", value))
        return self

    def order(self, key, desc=False):
        self.operations.append(("order", key, desc))
        return self

    def execute(self):
        return Response(self.rows)


class Client:
    def __init__(self, rows):
        self.rows = rows
        self.queries = []

    def table(self, name):
        assert name == "environmental_observations"
        query = Query(self.rows)
        self.queries.append(query)
        return query


def observation_row(org, location, observed_at="2026-11-10T10:24:33Z", **overrides):
    row = {
        "id": str(uuid4()),
        "organization_id": org,
        "location_id": location,
        "data_family": "satellite",
        "provider_code": "EARTH_SEARCH",
        "dataset_code": "SENTINEL_2_L2A",
        "variable_code": "ndvi_mean",
        "value": 0.62,
        "unit_code": "1",
        "observed_at": observed_at,
        "retrieved_at": "2026-11-10T12:00:00Z",
        "spatial_resolution_m": 10.0,
        "quality_flag": "valid",
        "source_url": "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/scene-001",
        "metadata": {
            "scene_id": "scene-001",
            "cloud_cover_pct": 12.4,
            "valid_pixel_count": 812,
            "valid_pixel_ratio": 0.84,
            "processing_version": "ndvi-v1",
            "mask_classes": [0, 1, 3, 8, 9, 10, 11],
        },
    }
    row.update(overrides)
    return row


def test_repository_returns_normalized_observations_for_tenant_location_and_dates():
    org, location = str(uuid4()), str(uuid4())
    row = observation_row(org, location)
    client = Client([row])

    result = SupabaseSatelliteObservationRepository(client).list_ndvi_for_scope(
        organization_id=org,
        location_id=location,
        from_date=date(2026, 11, 10),
        to_date=date(2026, 11, 12),
    )

    assert len(result) == 1
    assert result[0].value == pytest.approx(0.62)
    assert result[0].organization_id.hex == org.replace("-", "")
    assert result[0].location_id.hex == location.replace("-", "")
    query = client.queries[0]
    assert ("organization_id", "eq", org) in query.filters
    assert ("location_id", "eq", location) in query.filters
    assert ("data_family", "eq", "satellite") in query.filters
    assert ("provider_code", "eq", "EARTH_SEARCH") in query.filters
    assert ("dataset_code", "eq", "SENTINEL_2_L2A") in query.filters
    assert ("variable_code", "in", ["ndvi_mean", "ndvi_median"]) in query.filters
    assert ("observed_at", "gte", "2026-11-10T00:00:00+00:00") in query.filters
    assert ("observed_at", "lt", "2026-11-13T00:00:00+00:00") in query.filters
    assert any(op == ("order", "observed_at", False) for op in query.operations)


def test_repository_rejects_rows_returned_outside_requested_tenant_scope():
    org, location = str(uuid4()), str(uuid4())
    other_org = str(uuid4())
    client = Client([observation_row(other_org, location)])

    with pytest.raises(ValueError, match="organization"):
        SupabaseSatelliteObservationRepository(client).list_ndvi_for_scope(
            organization_id=org,
            location_id=location,
            from_date=date(2026, 11, 10),
            to_date=date(2026, 11, 12),
        )


def test_repository_rejects_invalid_persisted_ndvi_instead_of_silently_dropping_it():
    org, location = str(uuid4()), str(uuid4())
    client = Client([observation_row(org, location, value=1.4)])

    with pytest.raises(ValueError, match="NDVI"):
        SupabaseSatelliteObservationRepository(client).list_ndvi_for_scope(
            organization_id=org,
            location_id=location,
            from_date=date(2026, 11, 10),
            to_date=date(2026, 11, 12),
        )


def test_repository_rejects_reversed_date_scope():
    client = Client([])
    with pytest.raises(ValueError, match="on or after"):
        SupabaseSatelliteObservationRepository(client).list_ndvi_for_scope(
            organization_id=str(uuid4()),
            location_id=str(uuid4()),
            from_date=date(2026, 11, 12),
            to_date=date(2026, 11, 10),
        )
