from __future__ import annotations

import json
from urllib.parse import urlsplit, parse_qs
from uuid import uuid4

import pytest

from ba_environmental_engine.execution.supabase_locations import (
    SupabaseLocationRepository,
    SupabaseRestError,
)


class FakeResponse:
    status = 200

    def __init__(self, payload):
        self.payload = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, limit=-1):
        return self.payload[:limit]


class FakeOpener:
    def __init__(self, payload):
        self.payload = payload
        self.request = None
        self.timeout = None

    def open(self, request, timeout):
        self.request = request
        self.timeout = timeout
        return FakeResponse(self.payload)


def build_repo(payload):
    opener = FakeOpener(payload)
    repo = SupabaseLocationRepository(
        supabase_url="https://project-123.supabase.co",
        service_role_key="x" * 40,
        opener=opener,
    )
    return repo, opener


def test_location_lookup_is_tenant_scoped_and_returns_coordinates():
    org_id, location_id = str(uuid4()), str(uuid4())
    repo, opener = build_repo([{
        "id": location_id,
        "organization_id": org_id,
        "latitude": 36.19,
        "longitude": 5.41,
    }])

    result = repo.get_for_job(location_id=location_id, organization_id=org_id)

    assert result == {
        "id": location_id,
        "organization_id": org_id,
        "latitude": 36.19,
        "longitude": 5.41,
    }
    query = parse_qs(urlsplit(opener.request.full_url).query)
    assert query["id"] == [f"eq.{location_id}"]
    assert query["organization_id"] == [f"eq.{org_id}"]
    assert opener.request.get_header("Authorization") == f"Bearer {'x' * 40}"
    assert opener.timeout == 10


def test_location_lookup_rejects_missing_or_ambiguous_rows():
    org_id, location_id = str(uuid4()), str(uuid4())
    for payload in ([], [{"id": location_id, "organization_id": org_id}]*2):
        repo, _ = build_repo(payload)
        with pytest.raises(LookupError):
            repo.get_for_job(location_id=location_id, organization_id=org_id)


def test_location_lookup_rejects_cross_tenant_response():
    org_id, other_org, location_id = str(uuid4()), str(uuid4()), str(uuid4())
    repo, _ = build_repo([{
        "id": location_id,
        "organization_id": other_org,
        "latitude": 36.19,
        "longitude": 5.41,
    }])
    with pytest.raises(SupabaseRestError):
        repo.get_for_job(location_id=location_id, organization_id=org_id)


@pytest.mark.parametrize(
    "latitude,longitude",
    [(91, 0), (0, 181), (True, 1), ("36", 5)],
)
def test_location_lookup_rejects_invalid_coordinates(latitude, longitude):
    org_id, location_id = str(uuid4()), str(uuid4())
    repo, _ = build_repo([{
        "id": location_id,
        "organization_id": org_id,
        "latitude": latitude,
        "longitude": longitude,
    }])
    with pytest.raises(ValueError):
        repo.get_for_job(location_id=location_id, organization_id=org_id)


@pytest.mark.parametrize(
    "url",
    [
        "http://project.supabase.co",
        "https://user:pass@project.supabase.co",
        "https://project.supabase.co.evil.test",
        "https://project.supabase.co:8443",
        "https://project.supabase.co/other",
    ],
)
def test_location_repository_rejects_untrusted_project_urls(url):
    with pytest.raises(ValueError):
        SupabaseLocationRepository(
            supabase_url=url,
            service_role_key="x" * 40,
        )
