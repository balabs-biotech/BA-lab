"""Lease-bound HMAC transport for Sentinel-2 observation persistence.

This server-side adapter never forwards a user JWT or Supabase API key. The
receiver verifies the active database lease in addition to the worker HMAC.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from typing import Any, Callable, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID


MAX_REQUEST_BYTES = 256 * 1024
MAX_RESPONSE_BYTES = 64 * 1024
_ENDPOINT_PATH = "/functions/v1/earth-search-sentinel2-lease-ingest"


class LeaseIngestTransportError(RuntimeError):
    """Sanitized failure at the lease-bound persistence boundary."""


def _uuid(value: str, field: str) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError(f"{field} must be a valid UUID") from exc


def validate_lease_ingest_url(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("ingest_url must be a trusted Supabase lease-ingest URL")
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower()
    if (
        parsed.scheme != "https"
        or not re.fullmatch(r"[a-z0-9-]+\.supabase\.co", host)
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port not in (None, 443)
        or parsed.path != _ENDPOINT_PATH
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("ingest_url must be a trusted Supabase lease-ingest URL")
    return value


class _RejectRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _post_json(
    url: str,
    *,
    data: bytes,
    headers: Mapping[str, str],
    timeout: int,
) -> dict[str, Any]:
    request = Request(url, data=data, headers=dict(headers), method="POST")
    try:
        with build_opener(_RejectRedirect()).open(request, timeout=timeout) as response:
            if response.status < 200 or response.status >= 300:
                raise LeaseIngestTransportError("lease persistence request failed")
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except LeaseIngestTransportError:
        raise
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise LeaseIngestTransportError("lease persistence request failed") from exc
    if len(raw) > MAX_RESPONSE_BYTES:
        raise LeaseIngestTransportError("lease persistence response exceeded size limit")
    try:
        decoded = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise LeaseIngestTransportError("lease persistence response was invalid") from exc
    if not isinstance(decoded, dict) or decoded.get("ok") is not True:
        raise LeaseIngestTransportError("lease persistence rejected the observation batch")
    return decoded


def persist_leased_sentinel2_rows(
    *,
    job_id: str,
    lease_token: str,
    organization_id: str,
    location_id: str,
    rows: Sequence[Mapping[str, Any]],
    ingest_url: str,
    worker_secret: str,
    post: Callable[..., dict[str, Any]] | None = None,
    timestamp_seconds: int | None = None,
) -> dict[str, Any]:
    """Sign and submit a validated job-scoped observation batch."""
    trusted_url = validate_lease_ingest_url(ingest_url)
    normalized_job = _uuid(job_id, "job_id")
    normalized_lease = _uuid(lease_token, "lease_token")
    normalized_org = _uuid(organization_id, "organization_id")
    normalized_location = _uuid(location_id, "location_id")
    if not isinstance(rows, Sequence) or isinstance(rows, (str, bytes)):
        raise ValueError("rows must be a finite sequence")
    if len(rows) < 2 or len(rows) > 200 or len(rows) % 2:
        raise ValueError("rows must contain 2 to 200 entries in scene pairs")
    if any(not isinstance(row, Mapping) for row in rows):
        raise ValueError("each observation row must be an object")
    if not isinstance(worker_secret, str) or len(worker_secret.encode("utf-8")) < 32:
        raise ValueError("worker signing secret must contain at least 32 bytes")
    if timestamp_seconds is not None and (
        isinstance(timestamp_seconds, bool)
        or not isinstance(timestamp_seconds, int)
        or timestamp_seconds <= 0
    ):
        raise ValueError("timestamp_seconds must be a positive integer")

    payload = {
        "job_id": normalized_job,
        "lease_token": normalized_lease,
        "organization_id": normalized_org,
        "location_id": normalized_location,
        "rows": [dict(row) for row in rows],
    }
    raw_body = json.dumps(
        payload, separators=(",", ":"), sort_keys=True, ensure_ascii=False
    ).encode("utf-8")
    if len(raw_body) > MAX_REQUEST_BYTES:
        raise ValueError("lease persistence payload exceeds the request size limit")

    timestamp = int(time.time()) if timestamp_seconds is None else timestamp_seconds
    timestamp_text = str(timestamp)
    signature = hmac.new(
        worker_secret.encode("utf-8"),
        timestamp_text.encode("ascii") + b"." + raw_body,
        hashlib.sha256,
    ).hexdigest()
    headers = {
        "Content-Type": "application/json",
        "x-ba-worker-timestamp": timestamp_text,
        "x-ba-worker-signature": signature,
    }
    sender = post or _post_json
    try:
        return sender(trusted_url, data=raw_body, headers=headers, timeout=30)
    except LeaseIngestTransportError:
        raise
    except Exception as exc:
        raise LeaseIngestTransportError("lease persistence request failed") from exc
