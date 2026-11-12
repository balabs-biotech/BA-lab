from __future__ import annotations

import json

import pytest

from ba_environmental_engine.sources.earth_search_http import (
    EarthSearchHttpError,
    EarthSearchStacHttpClient,
)


class _Response:
    status = 200

    def __init__(self, payload):
        self.raw = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, limit):
        return self.raw[:limit]


class _Opener:
    def __init__(self, payload):
        self.payload = payload
        self.request = None
        self.timeout = None

    def open(self, request, timeout):
        self.request = request
        self.timeout = timeout
        return _Response(self.payload)


def test_http_client_posts_stac_search_json():
    opener = _Opener({"features": [], "links": []})
    client = EarthSearchStacHttpClient(opener=opener)
    response = client(
        method="POST",
        url="https://earth-search.aws.element84.com/v1/search",
        json={"collections": ["sentinel-2-l2a"]},
        timeout=12,
    )
    assert response.json() == {"features": [], "links": []}
    assert opener.request.method == "POST"
    assert opener.request.get_header("Content-type") == "application/json"
    assert opener.timeout == 12


def test_http_client_supports_get_pagination_without_body():
    opener = _Opener({"features": [], "links": []})
    client = EarthSearchStacHttpClient(opener=opener)
    client(
        method="GET",
        url="https://earth-search.aws.element84.com/v1/search?token=page2",
        json=None,
    )
    assert opener.request.method == "GET"
    assert opener.request.data is None


@pytest.mark.parametrize("url", [
    "http://earth-search.aws.element84.com/v1/search",
    "https://attacker.example/v1/search",
    "https://user@earth-search.aws.element84.com/v1/search",
    "https://earth-search.aws.element84.com:444/v1/search",
])
def test_http_client_rejects_untrusted_urls(url):
    client = EarthSearchStacHttpClient(opener=_Opener({}))
    with pytest.raises(ValueError, match="Earth Search HTTPS"):
        client(method="GET", url=url)


def test_http_client_rejects_oversized_stac_request():
    client = EarthSearchStacHttpClient(opener=_Opener({}))
    with pytest.raises(ValueError, match="size limit"):
        client(
            method="POST",
            url="https://earth-search.aws.element84.com/v1/search",
            json={"large": "x" * (1024 * 1024 + 1)},
        )
