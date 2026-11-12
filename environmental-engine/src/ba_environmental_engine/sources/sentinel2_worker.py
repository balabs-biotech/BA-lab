"""Private Sentinel-2 worker-to-Supabase persistence transport.

The worker never holds a Supabase service-role key. It forwards the caller's
JWT and signs the exact payload for the authenticated Edge Function boundary.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from dataclasses import dataclass
from typing import Any, Callable, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID
from urllib.parse import urlsplit

from ba_environmental_engine.sources.sentinel2_batch import process_sentinel2_stac_items


class Sentinel2PersistenceError(RuntimeError):
    """A generic persistence transport failure with no remote body or secret."""


@dataclass(frozen=True, slots=True)
class Sentinel2WorkerResult:
    items_received: int
    scenes_processed: int
    scenes_failed: int
    scenes_duplicated: int
    quality_rejected_scenes: int
    observations_submitted: int
    persistence_response: dict[str, Any] | None


def _validate_ingest_url(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("ingest_url must be a trusted Supabase Edge Function URL")
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower()
    if (
        parsed.scheme != "https"
        or not re.fullmatch(r"[a-z0-9-]+\.supabase\.co", host)
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port not in (None, 443)
        or parsed.path != "/functions/v1/earth-search-sentinel2-ingest"
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("ingest_url must be a trusted Supabase Edge Function URL")
    return value


class _RejectRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _post_json(
    url: str,
    *,
    data: bytes,
    headers: dict[str, str],
    timeout: int,
) -> dict[str, Any]:
    request = Request(url, data=data, headers=headers, method="POST")
    try:
        with build_opener(_RejectRedirect()).open(request, timeout=timeout) as response:
            payload = response.read(64 * 1024)
            if response.status < 200 or response.status >= 300:
                raise Sentinel2PersistenceError("remote persistence request failed")
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise Sentinel2PersistenceError("remote persistence request failed") from exc
    try:
        decoded = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise Sentinel2PersistenceError("remote persistence returned an invalid response") from exc
    if not isinstance(decoded, dict) or decoded.get("ok") is not True:
        raise Sentinel2PersistenceError("remote persistence rejected the observation batch")
    return decoded


def process_and_persist_sentinel2_batch(
    *,
    items: Sequence[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    organization_id: str | UUID,
    location_id: str | UUID,
    retrieved_at,
    processing_version: str,
    user_authorization: str,
    supabase_api_key: str,
    ingest_url: str,
    worker_secret: str,
    post: Callable[..., dict[str, Any]] | None = None,
    timestamp_seconds: int | None = None,
    opener: Callable[[str], Any] | None = None,
    minimum_valid_ratio: float = 0.2,
    max_pixels: int = 4_000_000,
    max_scenes: int = 100,
) -> Sentinel2WorkerResult:
    """Process a bounded STAC batch and persist only fully valid scene pairs."""
    trusted_url = _validate_ingest_url(ingest_url)
    if not isinstance(user_authorization, str) or not user_authorization.startswith("Bearer "):
        raise ValueError("caller bearer token is required")
    if not isinstance(supabase_api_key, str) or not supabase_api_key.strip():
        raise ValueError("Supabase publishable API key is required")
    if not isinstance(worker_secret, str) or len(worker_secret.encode("utf-8")) < 32:
        raise ValueError("worker signing secret must contain at least 32 bytes")
    if timestamp_seconds is not None and (
        isinstance(timestamp_seconds, bool)
        or not isinstance(timestamp_seconds, int)
        or timestamp_seconds <= 0
    ):
        raise ValueError("timestamp_seconds must be a positive integer")

    batch = process_sentinel2_stac_items(
        items,
        aoi_geojson,
        organization_id=organization_id,
        location_id=location_id,
        retrieved_at=retrieved_at,
        processing_version=processing_version,
        opener=opener,
        minimum_valid_ratio=minimum_valid_ratio,
        max_pixels=max_pixels,
        max_scenes=max_scenes,
    )

    valid_rows: list[dict[str, Any]] = []
    quality_rejected = 0
    for scene_result in batch.succeeded:
        rows = tuple(scene_result.observation_rows)
        if len(rows) != 2 or any(row.get("quality_flag") != "valid" for row in rows):
            quality_rejected += 1
            continue
        valid_rows.extend(rows)

    persistence_response = None
    if valid_rows:
        # Sign only after raster processing so the five-minute receiver window starts at send time.
        timestamp = int(time.time()) if timestamp_seconds is None else timestamp_seconds
        payload = {
            "organization_id": str(organization_id),
            "location_id": str(location_id),
            "rows": valid_rows,
        }
        raw_body = json.dumps(
            payload, separators=(",", ":"), sort_keys=True, ensure_ascii=False
        ).encode("utf-8")
        signed_payload = str(timestamp).encode("ascii") + b"." + raw_body
        signature = hmac.new(
            worker_secret.encode("utf-8"), signed_payload, hashlib.sha256
        ).hexdigest()
        headers = {
            "Authorization": user_authorization,
            "apikey": supabase_api_key,
            "Content-Type": "application/json",
            "x-ba-worker-timestamp": str(timestamp),
            "x-ba-worker-signature": signature,
        }
        sender = post or _post_json
        try:
            persistence_response = sender(
                trusted_url,
                data=raw_body,
                headers=headers,
                timeout=30,
            )
        except Sentinel2PersistenceError:
            raise
        except Exception as exc:
            raise Sentinel2PersistenceError("remote persistence request failed") from exc

    return Sentinel2WorkerResult(
        items_received=batch.items_received,
        scenes_processed=len(batch.succeeded),
        scenes_failed=len(batch.failed),
        scenes_duplicated=len(batch.duplicate_scene_ids),
        quality_rejected_scenes=quality_rejected,
        observations_submitted=len(valid_rows),
        persistence_response=persistence_response,
    )
