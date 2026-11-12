from __future__ import annotations

import json
from urllib.request import Request

import pytest

from ba_environmental_engine.execution.supabase_rpc import (
    SupabaseRpcError,
    SupabaseServiceRoleRpc,
)


class FakeResponse:
    status = 200

    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, size=-1):
        return self.payload[:size]


class FakeOpener:
    def __init__(self, payload):
        self.payload = payload
        self.request = None
        self.timeout = None

    def open(self, request, timeout):
        self.request = request
        self.timeout = timeout
        return FakeResponse(self.payload)


def test_rpc_posts_json_with_service_role_headers_and_parses_result():
    opener = FakeOpener(b"true")
    rpc = SupabaseServiceRoleRpc(
        supabase_url="https://example-project.supabase.co/",
        service_role_key="s" * 40,
        opener=opener,
    )

    assert rpc("heartbeat_environmental_ingestion_job", {"p_job_id": "abc"}) is True
    assert isinstance(opener.request, Request)
    assert opener.request.full_url.endswith(
        "/rest/v1/rpc/heartbeat_environmental_ingestion_job"
    )
    assert opener.request.get_header("Apikey") == "s" * 40
    assert opener.request.get_header("Authorization") == "Bearer " + "s" * 40
    assert json.loads(opener.request.data) == {"p_job_id": "abc"}
    assert opener.timeout == 15


@pytest.mark.parametrize(
    "url",
    [
        "http://example-project.supabase.co",
        "https://example-project.supabase.co.evil.test",
        "https://user@example-project.supabase.co",
        "https://example-project.supabase.co/path",
        "https://example-project.supabase.co?token=x",
    ],
)
def test_rejects_untrusted_project_urls(url):
    with pytest.raises(ValueError):
        SupabaseServiceRoleRpc(supabase_url=url, service_role_key="s" * 40)


def test_rejects_invalid_rpc_function_name():
    rpc = SupabaseServiceRoleRpc(
        supabase_url="https://example-project.supabase.co",
        service_role_key="s" * 40,
        opener=FakeOpener(b"null"),
    )
    with pytest.raises(ValueError):
        rpc("../environmental_ingestion_jobs", {})


def test_invalid_json_is_sanitized():
    rpc = SupabaseServiceRoleRpc(
        supabase_url="https://example-project.supabase.co",
        service_role_key="s" * 40,
        opener=FakeOpener(b"not-json"),
    )
    with pytest.raises(SupabaseRpcError, match="invalid JSON"):
        rpc("claim_environmental_ingestion_job", {})
