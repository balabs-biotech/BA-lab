"""Bounded HTTP adapter for the Earth Search STAC API."""
from __future__ import annotations

import json
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


MAX_STAC_RESPONSE_BYTES = 12 * 1024 * 1024
MAX_STAC_REQUEST_BYTES = 1024 * 1024
EARTH_SEARCH_HOST = "earth-search.aws.element84.com"


class EarthSearchHttpError(RuntimeError):
    """Sanitized Earth Search transport or response failure."""


class _RejectRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class _StacResponse:
    def __init__(self, status: int, raw: bytes) -> None:
        self.status_code = status
        try:
            self._payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise EarthSearchHttpError("Earth Search returned invalid JSON") from exc

    def raise_for_status(self) -> None:
        if self.status_code < 200 or self.status_code >= 300:
            raise EarthSearchHttpError("Earth Search request failed")

    def json(self) -> Any:
        return self._payload


class EarthSearchStacHttpClient:
    """Callable adapter matching search_sentinel2_scenes(request=...)."""

    def __init__(self, *, timeout_seconds: int = 30, opener: Any | None = None) -> None:
        if isinstance(timeout_seconds, bool) or not 1 <= timeout_seconds <= 60:
            raise ValueError("timeout_seconds must be between 1 and 60")
        self._timeout = timeout_seconds
        self._opener = opener or build_opener(_RejectRedirect())

    @staticmethod
    def _trusted_url(value: Any) -> str:
        if not isinstance(value, str):
            raise ValueError("STAC URL must remain on Earth Search HTTPS")
        parsed = urlsplit(value)
        if (
            parsed.scheme != "https"
            or parsed.hostname != EARTH_SEARCH_HOST
            or parsed.username is not None
            or parsed.password is not None
            or parsed.port not in (None, 443)
            or parsed.fragment
        ):
            raise ValueError("STAC URL must remain on Earth Search HTTPS")
        return value

    def __call__(
        self,
        *,
        method: str,
        url: str,
        json: Mapping[str, Any] | None = None,
        timeout: int | None = None,
    ) -> _StacResponse:
        trusted_url = self._trusted_url(url)
        verb = method.upper() if isinstance(method, str) else ""
        if verb not in {"GET", "POST"}:
            raise ValueError("STAC method must be GET or POST")
        data = None
        headers = {"Accept": "application/geo+json"}
        if verb == "POST":
            if not isinstance(json, Mapping):
                raise ValueError("STAC POST requires a JSON object")
            data = __import__("json").dumps(
                dict(json), separators=(",", ":"), ensure_ascii=False
            ).encode("utf-8")
            if len(data) > MAX_STAC_REQUEST_BYTES:
                raise ValueError("STAC request exceeds the size limit")
            headers["Content-Type"] = "application/json"
        elif json is not None:
            raise ValueError("STAC GET must not include a JSON body")

        request = Request(trusted_url, data=data, headers=headers, method=verb)
        try:
            with self._opener.open(request, timeout=timeout or self._timeout) as response:
                raw = response.read(MAX_STAC_RESPONSE_BYTES + 1)
                status = response.status
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            raise EarthSearchHttpError("Earth Search transport failed") from exc
        if len(raw) > MAX_STAC_RESPONSE_BYTES:
            raise EarthSearchHttpError("Earth Search response exceeded the size limit")
        return _StacResponse(status, raw)
