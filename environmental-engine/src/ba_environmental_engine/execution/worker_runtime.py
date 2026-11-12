"""Explicit runtime factory for the private leased environmental worker.

No environment is read and no worker starts at import time. Call the factory
from a dedicated private worker process after injecting its server-side secrets.
"""
from __future__ import annotations

import os
from typing import Mapping

from ba_environmental_engine.execution.leased_worker import (
    LeaseSettings,
    LeasedEnvironmentalWorker,
)
from ba_environmental_engine.execution.lease_ingest import validate_lease_ingest_url
from ba_environmental_engine.execution.sentinel2_job_processor import LeasedSentinel2JobProcessor
from ba_environmental_engine.execution.supabase_locations import SupabaseLocationRepository
from ba_environmental_engine.execution.supabase_rpc import SupabaseServiceRoleRpc
from ba_environmental_engine.sources.earth_search_http import EarthSearchStacHttpClient


def _required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name)
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f"required worker configuration is missing: {name}")
    return value.strip()


def _integer(env: Mapping[str, str], name: str, default: int, low: int, high: int) -> int:
    raw = env.get(name)
    try:
        value = default if raw is None else int(raw)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"invalid worker configuration: {name}") from exc
    if not low <= value <= high:
        raise RuntimeError(f"worker configuration is out of range: {name}")
    return value


def build_leased_environmental_worker_from_env(
    env: Mapping[str, str] | None = None,
) -> LeasedEnvironmentalWorker:
    """Build the worker from private process environment variables."""
    values = os.environ if env is None else env
    supabase_url = _required(values, "SUPABASE_URL")
    service_key = _required(values, "SUPABASE_SERVICE_ROLE_KEY")
    ingest_url = validate_lease_ingest_url(
        _required(values, "BA_SENTINEL2_LEASE_INGEST_URL")
    )
    worker_secret = _required(values, "BA_SENTINEL2_WORKER_SECRET")
    if len(worker_secret.encode("utf-8")) < 32:
        raise RuntimeError("BA_SENTINEL2_WORKER_SECRET must contain at least 32 bytes")

    lease_seconds = _integer(values, "BA_ENVIRONMENTAL_LEASE_SECONDS", 120, 30, 900)
    heartbeat_seconds = _integer(
        values, "BA_ENVIRONMENTAL_HEARTBEAT_SECONDS", 30, 1, lease_seconds - 1
    )
    try:
        idle_poll = float(values.get("BA_ENVIRONMENTAL_IDLE_POLL_SECONDS", "5"))
    except (TypeError, ValueError) as exc:
        raise RuntimeError("invalid worker configuration: BA_ENVIRONMENTAL_IDLE_POLL_SECONDS") from exc
    if not 0.1 <= idle_poll <= 300:
        raise RuntimeError("worker configuration is out of range: BA_ENVIRONMENTAL_IDLE_POLL_SECONDS")

    rpc = SupabaseServiceRoleRpc(
        supabase_url=supabase_url,
        service_role_key=service_key,
    )
    locations = SupabaseLocationRepository(
        supabase_url=supabase_url,
        service_role_key=service_key,
    )
    processor = LeasedSentinel2JobProcessor(
        locations=locations,
        stac_request=EarthSearchStacHttpClient(),
        ingest_url=ingest_url,
        worker_secret=worker_secret,
    )
    settings = LeaseSettings(
        worker_id=_required(values, "BA_ENVIRONMENTAL_WORKER_ID"),
        lease_seconds=lease_seconds,
        heartbeat_interval_seconds=heartbeat_seconds,
        idle_poll_seconds=idle_poll,
    )
    return LeasedEnvironmentalWorker(rpc=rpc, processor=processor, settings=settings)
