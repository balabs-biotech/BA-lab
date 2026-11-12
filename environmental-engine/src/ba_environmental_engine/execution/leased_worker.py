"""Lease-safe execution loop for durable environmental ingestion jobs.

The module is deliberately transport- and processor-agnostic. A deployment
adapter supplies an RPC callable and a job processor; importing the package
does not start a worker or read credentials.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Mapping
from uuid import UUID

logger = logging.getLogger(__name__)


class LeaseLostError(RuntimeError):
    """Raised when a worker no longer owns the current job lease."""


@dataclass(frozen=True, slots=True)
class LeaseSettings:
    worker_id: str
    lease_seconds: int = 120
    heartbeat_interval_seconds: int = 30
    idle_poll_seconds: float = 5.0

    def __post_init__(self) -> None:
        if not isinstance(self.worker_id, str) or not 3 <= len(self.worker_id) <= 120:
            raise ValueError("worker_id must contain between 3 and 120 characters")
        if isinstance(self.lease_seconds, bool) or not 30 <= self.lease_seconds <= 900:
            raise ValueError("lease_seconds must be between 30 and 900")
        if (
            isinstance(self.heartbeat_interval_seconds, bool)
            or not 1 <= self.heartbeat_interval_seconds < self.lease_seconds
        ):
            raise ValueError("heartbeat interval must be positive and shorter than the lease")
        if self.idle_poll_seconds < 0.1 or self.idle_poll_seconds > 300:
            raise ValueError("idle_poll_seconds must be between 0.1 and 300")


@dataclass(frozen=True, slots=True)
class JobOutcome:
    status: str
    result_summary: Mapping[str, Any]
    scenes_processed: int = 0
    scenes_failed: int = 0
    scenes_duplicated: int = 0
    observations_submitted: int = 0
    error_code: str | None = None

    def __post_init__(self) -> None:
        if self.status not in {"succeeded", "partial_failed", "failed"}:
            raise ValueError("job outcome status must be terminal")
        for name in (
            "scenes_processed",
            "scenes_failed",
            "scenes_duplicated",
            "observations_submitted",
        ):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise ValueError(f"{name} must be a non-negative integer")
        if not isinstance(self.result_summary, Mapping):
            raise ValueError("result_summary must be an object")


RpcCall = Callable[[str, Mapping[str, Any]], Any]
JobProcessor = Callable[[Mapping[str, Any], threading.Event], JobOutcome]


def _first_row(value: Any) -> Mapping[str, Any] | None:
    """Normalize PostgREST set-returning RPC output without accepting junk."""
    if isinstance(value, list):
        if not value:
            return None
        value = value[0]
    if not isinstance(value, Mapping):
        raise RuntimeError("claim RPC returned an invalid job payload")
    return value


class LeasedEnvironmentalWorker:
    """Claims one job at a time and guards processing with lease heartbeats.

    Processor contract: it must periodically inspect the supplied stop event
    during long-running work. If heartbeat renewal fails, the worker stops
    owning the job and will never submit a completion for that stale lease.
    """

    def __init__(
        self,
        *,
        rpc: RpcCall,
        processor: JobProcessor,
        settings: LeaseSettings,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._rpc = rpc
        self._processor = processor
        self._settings = settings
        self._sleep = sleep

    def claim(self) -> Mapping[str, Any] | None:
        result = self._rpc(
            "claim_environmental_ingestion_job",
            {
                "p_worker_id": self._settings.worker_id,
                "p_lease_seconds": self._settings.lease_seconds,
            },
        )
        job = _first_row(result)
        if job is None:
            return None
        required = ("id", "lease_token", "status", "job_type", "request_parameters")
        if any(key not in job for key in required):
            raise RuntimeError("claimed job is missing required lease or payload fields")
        if job["status"] != "processing":
            raise RuntimeError("claim RPC returned a job outside processing state")
        UUID(str(job["id"]))
        UUID(str(job["lease_token"]))
        if not isinstance(job["request_parameters"], Mapping):
            raise RuntimeError("claimed job request_parameters must be an object")
        return job

    def _heartbeat_loop(
        self, job_id: str, lease_token: str, stop: threading.Event, lost: threading.Event
    ) -> None:
        while not stop.wait(self._settings.heartbeat_interval_seconds):
            try:
                renewed = self._rpc(
                    "heartbeat_environmental_ingestion_job",
                    {
                        "p_job_id": job_id,
                        "p_lease_token": lease_token,
                        "p_lease_seconds": self._settings.lease_seconds,
                    },
                )
                if renewed is not True:
                    lost.set()
                    return
            except Exception:
                # A transient network failure is treated as lease loss: never
                # risk writing a result after ownership can no longer be proven.
                logger.warning("Environmental job heartbeat failed; lease ownership is uncertain")
                lost.set()
                return

    def run_once(self) -> bool:
        """Process one available job; return False when the queue is empty."""
        job = self.claim()
        if job is None:
            return False

        job_id, lease_token = str(job["id"]), str(job["lease_token"])
        stop, lost = threading.Event(), threading.Event()
        heartbeat = threading.Thread(
            target=self._heartbeat_loop,
            args=(job_id, lease_token, stop, lost),
            name=f"environmental-lease-{job_id[:8]}",
            daemon=True,
        )
        heartbeat.start()
        try:
            outcome = self._processor(job, lost)
            if lost.is_set():
                raise LeaseLostError("job lease was lost before completion")
            completed = self._rpc(
                "complete_environmental_ingestion_job",
                {
                    "p_job_id": job_id,
                    "p_lease_token": lease_token,
                    "p_status": outcome.status,
                    "p_result_summary": dict(outcome.result_summary),
                    "p_error_code": outcome.error_code,
                    "p_scenes_processed": outcome.scenes_processed,
                    "p_scenes_failed": outcome.scenes_failed,
                    "p_scenes_duplicated": outcome.scenes_duplicated,
                    "p_observations_submitted": outcome.observations_submitted,
                },
            )
            if completed is not True:
                raise LeaseLostError("completion RPC rejected the current lease")
            return True
        finally:
            stop.set()
            heartbeat.join(timeout=self._settings.heartbeat_interval_seconds + 1)

    def run_forever(self, shutdown: threading.Event) -> None:
        """Poll until shutdown; empty queues use a bounded idle delay."""
        while not shutdown.is_set():
            try:
                did_work = self.run_once()
            except LeaseLostError:
                logger.warning("Environmental job lease lost; result was not finalized")
                did_work = True
            except Exception:
                # Do not expose job payloads, credentials, or upstream bodies.
                logger.warning("Environmental job execution failed; lease will expire for retry")
                did_work = True
            if not did_work:
                shutdown.wait(self._settings.idle_poll_seconds)
