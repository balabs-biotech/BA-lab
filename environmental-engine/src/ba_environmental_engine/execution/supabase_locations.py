"""Minimal, tenant-verifying PostgREST reads for private environmental workers.

This adapter exposes only the location lookup needed to reconstruct a bounded
Sentinel-2 AOI from a claimed job. It is not a general table/query client.
"""
from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID


class SupabaseRestError(RuntimeError):
    """Sanitized private Supabase REST failure."""


class _RejectRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class SupabaseLocationRepository:
    """Resolve a location only when it matches the claimed job's tenant."""

    _SELECT = "id,organization_id,latitude,longitude"

    def __init__(
        self,
        *,
        supabase_url: str,
        service_role_key: str,
        timeout_seconds: int = 10,
        opener: Any | None = None,
    ) -> None:
        if not isinstance(supabase_url, str):
            raise ValueError("supabase_url must be a trusted Supabase project URL")
        parsed = urlsplit(supabase_url.rstrip("/"))
        host = (parsed.hostname or "").lower()
        if (
            parsed.scheme != "https"
            or not (host.endswith(".supabase.co") and bool(host[:-len(".supabase.co")]) and "." not in host[:-len(".supabase.co")] and all(char.isalnum() or char == "-" for char in host[:-len(".supabase.co")]))
            or parsed.username is not None
            or parsed.password is not None
            or parsed.port not in (None, 443)
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("supabase_url must be a trusted Supabase project URL")
        if not isinstance(service_role_key, str) or len(service_role_key.strip()) < 20:
            raise ValueError("service_role_key is required")
        if isinstance(timeout_seconds, bool) or not 1 <= timeout_seconds <= 30:
            raise ValueError("timeout_seconds must be between 1 and 30")
        self._base_url = f"https://{host}"
        self._key = service_role_key.strip()
        self._timeout = timeout_seconds
        self._opener = opener or build_opener(_RejectRedirect())

    @staticmethod
    def _uuid(value: str, field: str) -> str:
        try:
            return str(UUID(str(value)))
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValueError(f"{field} must be a valid UUID") from exc

    def get_for_job(self, *, location_id: str, organization_id: str) -> dict[str, Any]:
        location = self._uuid(location_id, "location_id")
        organization = self._uuid(organization_id, "organization_id")
        query = urlencode({
            "select": self._SELECT,
            "id": f"eq.{location}",
            "organization_id": f"eq.{organization}",
            "limit": "2",
        })
        request = Request(
            f"{self._base_url}/rest/v1/locations?{query}",
            headers={
                "apikey": self._key,
                "Authorization": f"Bearer {self._key}",
                "Accept": "application/json",
            },
            method="GET",
        )
        try:
            with self._opener.open(request, timeout=self._timeout) as response:
                if response.status < 200 or response.status >= 300:
                    raise SupabaseRestError("Supabase location lookup failed")
                raw = response.read(64 * 1024 + 1)
        except SupabaseRestError:
            raise
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            raise SupabaseRestError("Supabase location lookup failed") from exc
        if len(raw) > 64 * 1024:
            raise SupabaseRestError("Supabase location response exceeded size limit")
        try:
            rows = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SupabaseRestError("Supabase location response was invalid") from exc
        if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
            raise LookupError("job_location_not_found_in_organization")
        row = rows[0]
        if self._uuid(row.get("id"), "returned location id") != location:
            raise SupabaseRestError("Supabase location identity mismatch")
        if self._uuid(row.get("organization_id"), "returned organization id") != organization:
            raise SupabaseRestError("Supabase tenant identity mismatch")
        latitude, longitude = row.get("latitude"), row.get("longitude")
        if (
            isinstance(latitude, bool) or not isinstance(latitude, (int, float))
            or isinstance(longitude, bool) or not isinstance(longitude, (int, float))
            or not -90 <= latitude <= 90 or not -180 <= longitude <= 180
        ):
            raise ValueError("job_location_coordinates_invalid")
        return {
            "id": location,
            "organization_id": organization,
            "latitude": float(latitude),
            "longitude": float(longitude),
        }
