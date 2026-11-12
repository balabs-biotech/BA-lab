"""Minimal service-role PostgREST RPC adapter for the private queue worker.

Credentials are supplied by the process environment at construction time.
This client is intentionally restricted to RPC calls and never exposes raw
HTTP response bodies, headers, or credential-bearing URLs in exceptions.
"""
from __future__ import annotations

import json
import re
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class SupabaseRpcError(RuntimeError):
    """A sanitized Supabase RPC transport or contract failure."""


class _RejectRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class SupabaseServiceRoleRpc:
    """Call PostgREST RPCs using a server-side service-role credential."""

    def __init__(
        self,
        *,
        supabase_url: str,
        service_role_key: str,
        timeout_seconds: int = 15,
        opener: Any | None = None,
    ) -> None:
        if not isinstance(supabase_url, str):
            raise ValueError("supabase_url must be a trusted Supabase project URL")
        parsed = urlsplit(supabase_url.rstrip("/"))
        host = (parsed.hostname or "").lower()
        if (
            parsed.scheme != "https"
            or not re.fullmatch(r"[a-z0-9-]+\.supabase\.co", host)
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
        if isinstance(timeout_seconds, bool) or not 1 <= timeout_seconds <= 60:
            raise ValueError("timeout_seconds must be between 1 and 60")
        self._base_url = f"https://{host}"
        self._key = service_role_key.strip()
        self._timeout = timeout_seconds
        self._opener = opener or build_opener(_RejectRedirect())

    def __call__(self, function_name: str, params: Mapping[str, Any]) -> Any:
        if not isinstance(function_name, str) or not re.fullmatch(
            r"[a-z][a-z0-9_]{0,99}", function_name
        ):
            raise ValueError("function_name is invalid")
        if not isinstance(params, Mapping):
            raise ValueError("RPC parameters must be an object")
        body = json.dumps(dict(params), separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        request = Request(
            f"{self._base_url}/rest/v1/rpc/{function_name}",
            data=body,
            headers={
                "apikey": self._key,
                "Authorization": f"Bearer {self._key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with self._opener.open(request, timeout=self._timeout) as response:
                if response.status < 200 or response.status >= 300:
                    raise SupabaseRpcError("Supabase RPC request failed")
                raw = response.read(2 * 1024 * 1024 + 1)
        except SupabaseRpcError:
            raise
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            raise SupabaseRpcError("Supabase RPC transport failed") from exc
        if len(raw) > 2 * 1024 * 1024:
            raise SupabaseRpcError("Supabase RPC response exceeded the size limit")
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SupabaseRpcError("Supabase RPC returned invalid JSON") from exc
