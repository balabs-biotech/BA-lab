"""Dependency-free Supabase PostgREST adapter for the CultureOps queue RPCs.

The service-role credential is backend-only and must never be used by the frontend.
"""

from __future__ import annotations

import json
import os
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .registry import EngineResult
from .worker import ClaimedJob


class QueueTransportError(RuntimeError):
    """Raised when the queue API cannot be reached or returns an invalid response."""


class LeaseLostError(RuntimeError):
    """Raised when PostgreSQL rejects a mutation for a stale or expired lease."""


class SupabaseRestQueueClient:
    """Synchronous RPC adapter using only Python's standard library."""

    def __init__(
        self,
        supabase_url: str,
        service_role_key: str,
        *,
        timeout_seconds: float = 20.0,
        lease_seconds: int = 60,
    ) -> None:
        if not supabase_url.startswith(("https://", "http://")):
            raise ValueError("supabase_url must be an HTTP(S) URL")
        if not service_role_key or not service_role_key.strip():
            raise ValueError("service_role_key must be provided")
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        if lease_seconds < 3 or lease_seconds > 300:
            raise ValueError("lease_seconds must be between 3 and 300")
        self._base_url = supabase_url.rstrip("/")
        self._key = service_role_key.strip()
        self._timeout = timeout_seconds
        self._lease_seconds = lease_seconds

    @classmethod
    def from_env(cls) -> "SupabaseRestQueueClient":
        """Load backend-only credentials from process environment."""
        return cls(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )

    def _rpc(self, function: str, arguments: Mapping[str, Any]) -> Any:
        body = json.dumps(arguments, separators=(",", ":"), allow_nan=False).encode("utf-8")
        request = Request(
            f"{self._base_url}/rest/v1/rpc/{function}",
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
            with urlopen(request, timeout=self._timeout) as response:
                raw = response.read()
        except HTTPError as exc:
            details = exc.read(1000).decode("utf-8", errors="replace")
            raise QueueTransportError(
                f"Supabase RPC {function} returned HTTP {exc.code}: {details}"
            ) from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise QueueTransportError(
                f"Supabase RPC {function} transport failure: {type(exc).__name__}"
            ) from exc

        if not raw:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise QueueTransportError(
                f"Supabase RPC {function} returned invalid JSON"
            ) from exc

    def claim_one(self, worker_id: str) -> ClaimedJob | None:
        raw = self._rpc(
            "claim_engine_job",
            {"p_worker_id": worker_id, "p_lease_seconds": self._lease_seconds},
        )
        if raw is None:
            return None
        if not isinstance(raw, dict):
            raise QueueTransportError("claim_engine_job returned a non-object")
        try:
            return ClaimedJob(
                job_id=str(raw["job_id"]),
                organization_id=str(raw["organization_id"]),
                engine_code=str(raw["engine_code"]),
                engine_version=str(raw["engine_version"]),
                payload=raw["payload"],
                attempt_number=int(raw["attempt_number"]),
                worker_id=str(raw["worker_id"]),
                lease_token=str(raw["lease_token"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise QueueTransportError("claim_engine_job returned an incomplete job") from exc

    def heartbeat(self, job: ClaimedJob, *, lease_seconds: int) -> bool:
        result = self._rpc(
            "heartbeat_engine_job",
            {
                "p_job_id": job.job_id,
                "p_lease_token": job.lease_token,
                "p_worker_id": job.worker_id,
                "p_lease_seconds": lease_seconds,
            },
        )
        return result is True

    def complete(self, job: ClaimedJob, result: EngineResult) -> None:
        persisted = self._rpc(
            "complete_engine_job",
            {
                "p_job_id": job.job_id,
                "p_lease_token": job.lease_token,
                "p_worker_id": job.worker_id,
                "p_result": {
                    "data": dict(result.data),
                    "provenance": dict(result.provenance),
                },
                "p_result_summary": result.summary,
            },
        )
        if persisted is not True:
            raise LeaseLostError("PostgreSQL rejected completion: lease is no longer current")

    def fail(
        self,
        job: ClaimedJob,
        *,
        error_code: str,
        error_message: str,
        retryable: bool,
    ) -> None:
        outcome = self._rpc(
            "fail_engine_job",
            {
                "p_job_id": job.job_id,
                "p_lease_token": job.lease_token,
                "p_worker_id": job.worker_id,
                "p_error_code": error_code,
                "p_error_details": error_message[:4000],
                "p_retryable": retryable,
            },
        )
        if outcome == "lease_lost":
            raise LeaseLostError("PostgreSQL rejected failure update: lease is no longer current")
        if outcome not in ("retry_wait", "failed"):
            raise QueueTransportError("fail_engine_job returned an unknown outcome")
